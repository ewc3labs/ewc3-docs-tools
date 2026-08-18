'use strict';
// Migrating a MedAR-shaped roadmap register to the ownership table.
//
// THE PROBLEM. MedAR's register is headed `| Series | Last Num | Series Description |`. None of
// those three columns is a prefix. The first holds a human NAME ("Vertical Slices"); the prefix is
// buried inside the second, next to the number ("VS-392"); and one row can carry two series at once
// ("TS-02 · DW-024"). So `readSeries` finds no ownership table at all, every prefix in use reads as
// undeclared, and the register - which the roadmap explicitly calls the authoritative ID registry -
// is invisible to the tooling that exists to keep it honest.
//
// THE TRANSFORM is mechanical, which is the whole argument for doing it here rather than by hand:
//
//     | Series          | Last Num       | Series Description |
//     | Vertical Slices | VS-392         | Feature drops...   |
//     | Cross-Project   | TS-02 · DW-024 | Sibling-repo work  |
//                             |
//                             v
//     | Prefix | Scope      | Owner    | Last Used | Series          |
//     | VS     | global     | SX_Coder | VS-392    | Vertical Slices |
//     | TS     | global     | SX_Coder | TS-02     | Cross-Project   |
//     | DW     | global     | SX_Coder | DW-024    | Cross-Project   |
//
// RECONCILIATION, not just reshaping. The register is an input to minting and goes stale; the IDs in
// the delivery index are evidence and cannot. So the emitted table is built from the UNION of what
// the register declares and what the document actually uses, and every disagreement between them is
// reported rather than quietly resolved. A prefix used but never registered gets a row. A register
// number lower than the highest ID in use gets flagged - that is a mint collision waiting to happen,
// and it is the exact failure this whole surface exists to prevent.

const { readSeries, isLocalPrefix } = require('./series');

/** A register cell may name more than one series: `TS-02 · DW-024`. */
const ID_TOKEN = /\b([A-Z][A-Z0-9]{0,7})-(\d+)\b/g;

/** The MedAR register header, in either of the shapes seen in the wild. */
const REGISTER_HEADER = /^\|\s*Series\s*\|\s*Last\s*Num\s*\|/im;

/** Split a markdown table row into trimmed cells, dropping the leading/trailing empties. */
function cells(line) {
	const parts = line.split('|');
	if (parts.length && parts[0].trim() === '') { parts.shift(); }
	if (parts.length && parts[parts.length - 1].trim() === '') { parts.pop(); }
	return parts.map((c) => c.trim());
}

function isSeparator(line) {
	return /^\|[\s:|-]+\|?\s*$/.test(line) && line.includes('-');
}

/**
 * Locate and parse the register table.
 *
 * Returns `{ found: false }` when the document has no such table, which is not an error - it is the
 * answer for a repo that either already migrated or never had one.
 */
function parseRegister(text) {
	const lines = text.split('\n');
	const at = lines.findIndex((l) => REGISTER_HEADER.test(l));
	if (at === -1) { return { found: false, rows: [] }; }

	const rows = [];
	let end = at + 1;
	for (let i = at + 1; i < lines.length; i++) {
		const line = lines[i];
		if (!line.trim().startsWith('|')) { break; }
		end = i;
		if (isSeparator(line)) { continue; }

		const c = cells(line);
		const seriesName = c[0] || '';
		const lastCell = c[1] || '';
		const desc = c.slice(2).join(' | ');

		// Every ID-shaped token in the "Last Num" cell is its own series.
		const found = [];
		ID_TOKEN.lastIndex = 0;
		let m;
		while ((m = ID_TOKEN.exec(lastCell)) !== null) {
			found.push({ prefix: m[1], num: Number.parseInt(m[2], 10), raw: m[0] });
		}
		rows.push({ seriesName, lastCell, desc, series: found, line: i });
	}
	return { found: true, headerAt: at, endAt: end, rows };
}

/**
 * Reconcile the register against the IDs actually used, and produce the ownership rows.
 *
 * `owner` is the repo name that will appear in the Owner column. `used` is the Map from readSeries.
 */
function reconcile(register, used, owner) {
	const byPrefix = new Map();

	for (const row of register.rows) {
		for (const s of row.series) {
			byPrefix.set(s.prefix, {
				prefix: s.prefix,
				owner,
				registered: s.num,
				registeredRaw: s.raw,
				highestUsed: used.has(s.prefix) ? used.get(s.prefix) : null,
				seriesName: row.seriesName,
				origin: 'register',
			});
		}
	}

	// A prefix the document USES but never registered.
	//
	// Do NOT assign it to `owner`. This is measured, not hypothetical: SX_Coder's index carries a
	// DT-01 row while DT is minted in DevTools, and that roadmap already records DT-042 being minted
	// twice because two registers each believed they owned the series. Auto-claiming here would
	// manufacture exactly the collision this table exists to prevent - and it would do it silently,
	// under a migration the reader assumes is lossless.
	//
	// So an unregistered prefix is reported as UNCLAIMED and its row demands a human decision:
	// declare it here, or redirect the rows to the repo that really owns it.
	for (const [prefix, highest] of used) {
		if (byPrefix.has(prefix)) { continue; }
		byPrefix.set(prefix, {
			prefix, owner: null,
			registered: null, registeredRaw: null,
			highestUsed: highest,
			seriesName: '',
			origin: 'used-only',
		});
	}

	const out = [...byPrefix.values()];
	for (const r of out) {
		r.scope = isLocalPrefix(r.prefix) ? 'repo-local' : 'global';
		// The register is an INPUT and goes stale; the IDs are evidence and cannot. Disagreement in
		// this direction means the next mint reuses a live number.
		r.stale = r.registered !== null && r.highestUsed !== null && r.highestUsed > r.registered;
		r.lastUsed = Math.max(r.registered || 0, r.highestUsed || 0) || null;
	}
	out.sort((a, b) => a.prefix.localeCompare(b.prefix));
	return out;
}

/** Render the ownership table. `width` pads the Last Used number; 0 leaves it as-is. */
function renderOwnership(rows, width) {
	const pad = (n) => (width > 0 ? String(n).padStart(width, '0') : String(n));
	const out = [
		'| Prefix | Scope | Owner | Last Used | Series |',
		'| --- | --- | --- | --- | --- |',
	];
	for (const r of rows) {
		const last = r.lastUsed === null
			? '_none yet_'
			: `<!--ewc3:last${r.prefix}-->${r.prefix}-${pad(r.lastUsed)}<!--/-->`;
		// An unclaimed prefix must read as a question, not as a fact. `**?**` is deliberately ugly:
		// it is a row a human has to resolve, and it should look like one.
		const owner = r.owner === null ? '**?** _unclaimed_' : r.owner;
		out.push(`| ${r.prefix} | ${r.scope} | ${owner} | ${last} | ${r.seriesName || '—'} |`);
	}
	return out.join('\n');
}

/**
 * Produce the migrated document text plus a report of what changed and what disagreed.
 *
 * The document is returned, never written - the caller owns the write target, and the write target
 * is always the shadow folder.
 */
function migrateText(text, { owner, width = 5 }) {
	const register = parseRegister(text);
	const { used } = readSeries.fromText ? readSeries.fromText(text) : { used: usedFromText(text) };
	const rows = reconcile(register, used, owner);

	if (!register.found) {
		return { ok: false, reason: 'no-register', rows, text: null };
	}

	const lines = text.split('\n');
	const original = lines.slice(register.headerAt, register.endAt + 1);

	// Carry the original register through verbatim, folded away.
	//
	// The new table is deliberately thin - one prefix per row - and the old one is not: its
	// descriptions run to whole paragraphs with links, and one row can describe two series at once,
	// which cannot be split without either duplicating the paragraph or dropping it. Dropping it
	// would make a migration advertised as non-destructive quietly lossy, which is worse than an
	// untidy document. So the thin table governs, and the prose survives underneath it where a human
	// can still read what the series were actually FOR.
	const preserved = [
		'',
		'<details>',
		'<summary>The register as it stood before migration (kept verbatim - nothing here was thrown away)</summary>',
		'',
		...original,
		'',
		'</details>',
	];

	const table = renderOwnership(rows, width).split('\n');
	lines.splice(register.headerAt, register.endAt - register.headerAt + 1, ...table, ...preserved);

	return { ok: true, rows, register, text: lines.join('\n') };
}

/** IDs used in first-column table cells - the same anchor readSeries uses, applied to a string. */
function usedFromText(text) {
	const re = /^\|\s*([A-Z][A-Z0-9]{0,7})-(\d+)\s*\|/gm;
	const used = new Map();
	let m;
	while ((m = re.exec(text)) !== null) {
		const n = Number.parseInt(m[2], 10);
		if (!used.has(m[1]) || n > used.get(m[1])) { used.set(m[1], n); }
	}
	return used;
}

module.exports = { parseRegister, reconcile, renderOwnership, migrateText, usedFromText };
