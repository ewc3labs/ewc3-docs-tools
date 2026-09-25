'use strict';
// Minting a slice in an adopted repository. DOCS-041.
//
// `index --write` refuses a document whose id the register never minted, and that refusal is right: a
// generator that can mint can mint by accident, and a spent number is spent forever. So minting is its own,
// deliberate command, and it derives everything a person would otherwise type by hand - the next id, the
// document, the row in the right table - so the two surfaces agree from the first commit.
//
// `planMint` decides and returns what to write; it writes nothing. The CLI prints the plan and, with
// --write, applies it.

const fs = require('fs');
const path = require('path');
const frontmatter = require('./frontmatter.js');
const {
	padId, slug, section, rowCells, columnKey, headerMap, sliceHref, inventorySlices, normalizeId,
} = require('./slices.js');
const { roadmapFiles, readSeries, withoutFences, ownershipHeader, COUNTER_COLUMN } = require('./series.js');
const { renderIndex, detectWidths, indexRows } = require('./deliveryindex.js');
const { format } = require('./format.js');

/** Each table under `## Delivery Index`, with the `###` heading it sits under and its line span. */
function subTables(lines) {
	const sec = section(lines, 'Delivery Index');
	if (!sec) { return []; }
	const out = [];
	let heading = '';
	for (let i = sec.start + 1; i < sec.end; i++) {
		const t = lines[i].trim();
		const h = /^#{3,6}\s+(.*?)\s*#*$/.exec(t);
		if (h) { heading = h[1]; continue; }
		if (!/^\|\s*ID\s*\|/i.test(t)) { continue; }
		let last = i;
		for (let k = i + 1; k < sec.end && lines[k].trim().startsWith('|'); k++) { last = k; }
		out.push({ heading, headerLine: i, lastLine: last, headings: rowCells(lines[i]) });
		i = last;
	}
	return out;
}

/** Markdown files under `dir`, recursively; [] when it does not exist. */
function markdownUnder(dir) {
	if (!fs.existsSync(dir)) { return []; }
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) { return markdownUnder(p); }
		return /\.md$/i.test(e.name) ? [p] : [];
	});
}

/**
 * The number part of every id of `prefix` a set of documents claims, from frontmatter or filename.
 * An archived document's id counts: a retired number is spent, and minting it again makes one id mean two
 * things in the history (asked downstream, for a series whose oldest slices are archived first).
 */
function documentNumbers(files, prefix) {
	const out = [];
	for (const e of inventorySlices(files.map((f) => ({ name: path.basename(f), text: fs.readFileSync(f, 'utf8') })))) {
		const m = e.id && new RegExp(`^${prefix}-(\\d+)`).exec(e.id);
		if (m) { out.push(Number.parseInt(m[1], 10)); }
	}
	return out;
}

/**
 * The number in a register's counter cell for `prefix`, or 0. It can run ahead of the rows.
 *
 * THE REGISTER IS CHOSEN BY `ownershipHeader`, not by a scan of its own. This had a second scan, which knew nothing
 * about `<details>` or about `Prefix` winning over `Series` - so with an archival register above the live one, the
 * declaration reader ignored the archive while THIS read its counter and minted from it (Codex P1, PR #30). One
 * table, two parsers, two answers.
 */
function lastUsedCell(text, prefix) {
	const chosen = ownershipHeader(text);
	if (!chosen) { return 0; }
	const lines = chosen.text.split('\n');
	const header = chosen.line;
	// `Last Used` and `Last Num` are the same column under two names, and `COUNTER_COLUMN` is the one place that
	// says so - shared with the register test and the freeze ceiling. Reading only the first name turned an accepted
	// register into a SILENT collision: the counter said AIR-28, the highest retained row said AIR-27, and the mint
	// handed back 28 (Codex P1, PR #30). `Next` is deliberately not read - it holds the id NOT yet used.
	const at = rowCells(lines[header]).findIndex((c) => COUNTER_COLUMN.test(c));
	if (at === -1) { return 0; }
	for (let i = header + 1; i < lines.length && lines[i].trim().startsWith('|'); i++) {
		const cells = rowCells(lines[i]);
		if ((cells[0] || '').trim() !== prefix) { continue; }
		const m = new RegExp(`${prefix}-(\\d+)`).exec(cells[at] || '');
		return m ? Number.parseInt(m[1], 10) : 0;
	}
	return 0;
}

/**
 * Decide a mint. Returns `{ ok, code, errors, notes, id, file, table, docPath, docText, roadmap, roadmapText }`.
 *
 * `code` follows the toolkit contract: 2 for an invocation that cannot run (usage), 1 for a refusal that
 * names what the register says.
 */
function planMint({ repo, config = {}, prefix, title, state, sets = [], table }) {
	const errors = [];
	const notes = [];
	const refuse = (code, msg) => ({ ok: false, code, errors: [...errors, msg], notes });

	if (!prefix || !/^[A-Z][A-Z0-9]{0,7}$/.test(prefix)) { return refuse(2, 'a PREFIX is required: uppercase, as the register declares it'); }
	if (!title || !String(title).trim()) { return refuse(2, 'a "title" is required'); }
	const pairs = [];
	for (const s of sets) {
		const m = /^([^=]+)=(.*)$/.exec(s);
		if (!m) { return refuse(2, `--set takes column=value, got ${JSON.stringify(s)}`); }
		pairs.push([columnKey(m[1]), m[2]]);
	}

	const project = path.join(repo, 'docs', 'project');
	const sliceDir = path.join(project, 'slices');
	if (!fs.existsSync(sliceDir)) {
		return refuse(2, 'no docs/project/slices - `slice new` mints in an adopted repository; migrate first');
	}
	const inTree = (f) => { const rel = path.relative(project, f); return rel && !rel.startsWith('..') && !path.isAbsolute(rel); };
	const roadmaps = roadmapFiles(repo, (config.series || {}).roadmaps).filter(inTree)
		.map((file) => ({ file, text: fs.readFileSync(file, 'utf8').split('\r\n').join('\n') }))
		.map((r) => ({ ...r, tables: subTables(r.text.split('\n')) }))
		.filter((r) => r.tables.length);
	if (!roadmaps.length) { return refuse(2, 'no roadmap under docs/project carries a Delivery Index table'); }

	// OWNERSHIP. Declared by some register, not only cited, and not frozen. Read the way `series` reads it.
	const series = roadmapFiles(repo, (config.series || {}).roadmaps).map((f) => readSeries(f));
	const declared = series.some((s) => s.declared.has(prefix));
	// EVERY scope record is consulted: a freeze written by any surface retires the series, whichever register
	// is read first (Codex P1, PR #12).
	const scopes = series.map((s) => s.scopes.get(prefix)).filter(Boolean);
	const frozen = scopes.find((s) => s.frozen);
	if (frozen) {
		return refuse(1, `${prefix} is FROZEN (${frozen.declared}) - a register retired the series; mint new work elsewhere`);
	}
	const scope = scopes.find((s) => s.reference);
	if (!declared) {
		return refuse(1, scope && scope.reference
			? `${prefix} is reference-only here - the register cites it and does not own it`
			: `${prefix} is not declared by any register in this repository - declare it before minting`);
	}

	// THE NEXT NUMBER: one past everything that has ever claimed one - rows and other declaring positions,
	// the register's Last Used, live slice documents, and archived ones.
	const highest = Math.max(0,
		...series.map((s) => s.used.get(prefix) || 0),
		...roadmaps.map((r) => lastUsedCell(r.text, prefix)),
		...documentNumbers(markdownUnder(sliceDir), prefix),
		...documentNumbers(markdownUnder(path.join(repo, 'docs', '_ARCHIVE')), prefix));
	const next = highest + 1;

	// THE TABLE: the one holding this prefix's highest row. A prefix with no row anywhere needs --table,
	// because guessing where a new series belongs is a planning decision.
	let target = null;
	let best = -1;
	for (const r of roadmaps) {
		const rows = indexRows(r.text);
		for (const t of r.tables) {
			for (const row of rows) {
				if (row.line <= t.headerLine || row.line > t.lastLine) { continue; }
				const m = new RegExp(`^${prefix}-(\\d+)`).exec(row.id);
				if (m && Number.parseInt(m[1], 10) > best) { best = Number.parseInt(m[1], 10); target = { roadmap: r, table: t }; }
			}
		}
	}
	const allTables = roadmaps.flatMap((r) => r.tables.map((t) => ({ roadmap: r, table: t })));
	// A table with no `###` heading is named "(no heading)" - the label the refusal prints must be accepted back.
	const label = (t) => t.heading || '(no heading)';
	const named = (h) => allTables.filter((x) => label(x.table).toLowerCase() === String(h).trim().toLowerCase());
	const names = allTables.map((x) => `"${label(x.table)}"`).join(', ');
	if (table !== undefined) {
		const hits = named(table);
		if (!hits.length) { return refuse(1, `--table "${table}" names no table under the Delivery Index; the tables are ${names}`); }
		if (hits.length > 1) { return refuse(1, `--table "${table}" names ${hits.length} tables; headings must be unique to choose one`); }
		if (target && hits[0].table !== target.table) {
			return refuse(1, `${prefix} already lives in "${target.table.heading}" - --table "${table}" disagrees, and a series is not split by accident`);
		}
		target = hits[0];
	}
	if (!target) { return refuse(1, `${prefix} has no row in any table yet - choose one with --table; the tables are ${names}`); }

	// COLUMNS. Rows are rendered against the register's FIRST table header, so a target table with other
	// columns would receive values in the wrong cells (Copilot, PR #12). Refused rather than guessed.
	const first = target.roadmap.tables[0].headings.map((h) => h.trim()).join('|');
	if (target.table.headings.map((h) => h.trim()).join('|') !== first) {
		return refuse(1, `"${label(target.table)}" has different columns from the first table under the Delivery Index; index renders every table with the first table's columns, so this register must share one header`);
	}
	// --set names a real column of that table; id, state, title and doc are derived or have flags.
	const headings = target.table.headings;
	const map = headerMap(headings);
	const keys = headings.map((h) => columnKey(h));
	const reserved = new Set(['id', 'doc', keys[map.state], keys[map.title]].filter(Boolean));
	for (const [k] of pairs) {
		if (reserved.has(k) || k === 'state' || k === 'title') {
			return refuse(1, `--set ${k} is not allowed: the id and doc are derived, and state and title have their own arguments`);
		}
		if (!keys.includes(k)) { return refuse(1, `--set ${k}: "${label(target.table)}" has no such column; it has ${headings.map((h) => h.trim()).join(', ')}`); }
		// With no Doc column the LAST cell points at the document when it is empty; filling it would leave the
		// new document unreachable from its row (Copilot, PR #12).
		if (!keys.includes('doc') && k === keys[keys.length - 1]) {
			return refuse(1, `--set ${k}: with no Doc column, that cell is the pointer to the document and is left empty`);
		}
	}

	// THE ID AND FILE. Width is the declared one, else what the register already writes.
	const width = ((config.series || {}).widths || {})[prefix] || detectWidths(target.roadmap.text)[prefix] || 0;
	const id = padId(prefix, next, '', width);
	const file = `${id}_${slug(String(title)) || 'slice'}.md`;
	const taken = fs.readdirSync(sliceDir).map((n) => n.toLowerCase());
	if (taken.includes(file.toLowerCase())) { return refuse(1, `docs/project/slices/${file} already exists`); }

	// STATE: the flag, else the register's own spelling of "planned" (a legend with a glyph keeps it).
	let st = state;
	if (!st) {
		const states = indexRows(target.roadmap.text).map((r) => (rowCells(r.raw)[map.state] || '').trim()).filter((s) => /planned/i.test(s));
		st = states.sort((a, b) => states.filter((x) => x === b).length - states.filter((x) => x === a).length)[0];
		// No row to copy the spelling from: a guessed bare "planned" may be a state this register never uses.
		if (!st) { return refuse(1, 'no row in this register says "planned", so its spelling cannot be copied - pass --state'); }
	}

	const data = {};
	headings.forEach((h, i) => {
		const k = keys[i];
		// `state` and `title` by those names, whatever the headers call them: that is how migrate writes them
		// and how `renderRow` reads them back.
		if (i === map.id) { data.id = id; } else if (i === map.state) { data.state = st; } else if (i === map.title) { data.title = String(title); } else if (k === 'doc') { data.doc = `[${id}](${sliceHref(file)})`; } else {
			const set = pairs.find(([pk]) => pk === k);
			data[k] = set ? set[1] : '';
		}
	});
	const docText = frontmatter.write(`# ${id} — ${title}\n`, data);

	// THE ROW: a placeholder at the end of the table, rendered by index's own renderer, so the row and the
	// document agree by construction.
	const lines = target.roadmap.text.split('\n');
	lines.splice(target.table.lastLine + 1, 0, `| ${[id, ...headings.slice(1).map(() => '')].join(' | ')} |`);
	const rendered = renderIndex(lines.join('\n'), [{ ...data, __file: file }]);
	if (!rendered.ok || rendered.rendered !== 1) { return refuse(2, 'the new row could not be rendered into the table'); }
	const crlf = fs.readFileSync(target.roadmap.file, 'utf8').includes('\r\n');

	// A REGISTER KEPT FORMAT-CLEAN STAYS FORMAT-CLEAN. The new row's doc link is inline; in a register whose
	// links `format` has moved into reference definitions, that one inline link made the roadmap outside its
	// rows stop being format's output, so `index --check` stopped accepting the formatted form for EVERY row
	// and every older row read as diverged (found minting on this repository). `format` never changes a word.
	const formatOptions = { ...(config.format || {}) };
	const formatClean = format(target.roadmap.text, formatOptions) === target.roadmap.text;
	const roadmapOut = formatClean ? format(rendered.text, formatOptions) : rendered.text;

	// A MENTION IS NOT A MINT, but saying so is cheap: prose that already names the new id deserves a look.
	const mention = new RegExp(`\\b${prefix}-0*${next}(?![0-9A-Za-z])`);
	for (const r of roadmaps) {
		withoutFences(r.text).split('\n').forEach((l, i) => {
			if (mention.test(l) && !l.trim().startsWith('|')) {
				notes.push(`${path.relative(repo, r.file).split(path.sep).join('/')}:${i + 1} already mentions ${id}`);
			}
		});
	}

	return {
		ok: true, code: 0, errors, notes, id, file,
		table: target.table.heading,
		docPath: path.join(sliceDir, file),
		docText,
		roadmap: target.roadmap.file,
		roadmapText: crlf ? roadmapOut.split('\n').join('\r\n') : roadmapOut,
		// The CLI formats the roadmap again AFTER refreshing values: a value that grows across a wrap
		// boundary would otherwise undo this pass (Codex, PR #13). Values first, then format, as `fix` does.
		reformat: formatClean,
	};
}

module.exports = { planMint, subTables };
