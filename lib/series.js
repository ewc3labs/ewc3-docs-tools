'use strict';
// ID series: who owns a prefix, and what number comes next.
//
// THE PROBLEM. A roadmap's "last number used" cell is the INPUT to minting an ID, not a summary of
// one. When it goes stale it does not merely look wrong - the next person takes a number that is
// already taken, and nothing complains. Worse across repositories: if two roadmaps both think they
// own `FIX`, the IDs collide and the collision is invisible until someone follows a reference to
// the wrong document.
//
// THE MODEL. A roadmap declares the prefixes it OWNS, in a table near the top:
//
//     | Prefix | Owner | Series description |
//     | --- | --- | --- |
//     | PQ | excel-power-query-editor | product slices and fixes |
//     | DT | ewc3-docs-tools          | documentation tooling |
//
// From that, two things are derivable and therefore cannot drift:
//
//   1. the last number used per prefix, read from the ID tables themselves;
//   2. whether the document uses a prefix it has not declared - which is the check that makes the
//      table load-bearing rather than decorative.
//
// A prefix belongs to exactly one roadmap. That is the whole cross-repo discipline: `DT` is owned by
// ewc3-docs-tools, so nothing else may mint a DT number, and anyone reading a DT reference knows
// where to look.

const fs = require('fs');
const { expand } = require('./glob');
// Reuse the Delivery Index cell splitter rather than writing a second one - it already handles
// escaped pipes, and two splitters would disagree the first time a register cell contains one.
const { rowCells } = require('./slices');

/**
 * Prefixes that are deliberately REPO-LOCAL rather than globally unique.
 *
 * `FIX` is canon: every roadmap owns its own FIX series, and `FIX-3` in one repository is simply a
 * different thing from `FIX-3` in another. That is safe because a fix is never referenced from
 * outside the repository it fixes. Making FIX global would mean coordinating a number across repos
 * every time anyone fixes anything, which nobody would do twice.
 *
 * Everything else is global by default, so a stray prefix collision gets caught rather than assumed
 * harmless.
 */
const LOCAL_PREFIXES = new Set(['FIX']);

/** Is this prefix repo-local, and therefore exempt from the claimed-twice check? */
function isLocalPrefix(prefix) {
	return LOCAL_PREFIXES.has(prefix.toUpperCase());
}

/** Where roadmaps live unless a repository says otherwise. */
const DEFAULT_ROADMAPS = [
	'docs/project/*Roadmap.md',
	'docs/project/*ROADMAP.md',
	// A roadmap one directory further down is still the roadmap. Measured: MedAR_AI_Runtime and
	// SX_DW both keep theirs in docs/project/roadmap/, so the shallower globs matched NOTHING and
	// `series` reported success over zero files - the same silent-coverage shape as DT-7.
	'docs/project/roadmap/*Roadmap.md',
	'docs/project/roadmap/*ROADMAP.md',
	// A separately-numbered backlog mints into the same series as the roadmap beside it, so it is
	// a planning surface and has to be read as one. Measured: MedAR_AI_Runtime's backlog held four
	// IDs colliding across repositories that were invisible to every extractor in that estate.
	'docs/project/backlog/*Backlog.md',
	'docs/project/*Backlog.md',
];

/** A row in the ownership table: `| PQ | owner | description |`. */
/**
 * A row in the ownership table.
 *
 * The first cell may be a bare prefix (`| PQ |`) or a MINT TEMPLATE (`` | `AIR-NN` | ``), which is
 * how the canonical MedAR register writes it. The literal `N`s are the discrimination: `AIR-NN`
 * is a template declaring the series, `AIR-28` is an actual ID and declares nothing - a register
 * row and a Delivery Index row must not be mistaken for one another.
 */
const OWNERSHIP_ROW = /^\|\s*([A-Z][A-Z0-9]{0,7})\s*\|\s*([^|]+?)\s*\|/gm;

/** Column headers that are never a prefix, so a header row cannot declare one. */
const HEADER_WORDS = new Set(['PREFIX', 'SERIES', 'SCOPE', 'OWNER', 'MEANING', 'ID', 'LAST', 'NEXT', 'STATE', 'SLICE', 'EST', 'DOC', 'STATUS']);

/**
 * The positions in which a planning surface DECLARES an ID, rather than citing one.
 *
 * This list carries the whole discrimination between a mint and a mention, and it is short
 * because most of the work is done by WHERE it is applied: `readSeries` is only ever handed
 * files matched by `series.roadmaps`. Everything outside a planning surface is a citation by
 * construction, so these patterns never have to tell a mint from a mention in ordinary prose.
 * They only say where, inside a document ALLOWED to mint, minting happens.
 *
 * That is not academic. A survey document quoting another repository's roadmap, and a skill
 * file teaching agents to write `[VS-21]`, both contain IDs in quantity and mint nothing.
 * Excluding such documents by class does not scale - a document that TEACHES about IDs is
 * permanently full of them - so the rule has to be positive: only a planning surface can mint.
 */
const DECLARING_POSITIONS = [
	/** A Delivery Index row: `| PQ-34 | ...`. */
	/^\|\s*\*{0,2}`?([A-Z][A-Z0-9]{0,7})-(\d+)`?\*{0,2}\s*\|/gm,
	/**
	 * An ordered or bulleted backlog item that DEFINES an ID: "3. `VS-07` - GPU allocation ...".
	 *
	 * The trailing separator is load-bearing. A list item shaped "ID - definition" declares; one
	 * mentioning an ID inside a sentence cites. Without it, a roadmap's own Notes section
	 * bulleting a sibling repository's slice would register as a mint of a prefix this roadmap
	 * does not own, and `series` would then fail on an undeclared prefix nobody minted.
	 */
	/^[ \t]{0,3}(?:\d+\.|[-*+])\s+\*{0,2}`?([A-Z][A-Z0-9]{0,7})-(\d+)`?\*{0,2}\s*[\u2014\u2013:-]/gm,
	/**
	 * A section heading naming its slice: `### DW-023 - queue flag contract`.
	 *
	 * Measured recovery: SX_DW mints DW-023 and DW-024 as headings only, which no table or list
	 * pattern sees. A heading that opens with an ID is naming the thing the section IS, which is
	 * a declaration in every sense that matters.
	 */
	/^#{2,4}\s+\*{0,2}`?([A-Z][A-Z0-9]{0,7})-(\d+)`?/gm,
];

function roadmapFiles(root, specs) {
	const list = specs && specs.length ? specs : DEFAULT_ROADMAPS;
	const seen = new Set();
	const out = [];
	for (const spec of list) {
		for (const f of expand(spec, root)) {
			if (!seen.has(f)) { seen.add(f); out.push(f); }
		}
	}
	return out;
}

/**
 * Read a roadmap's declared prefixes and the IDs it actually uses.
 *
 * The ownership table is recognised by its header containing "Prefix"; any table row whose first
 * cell is a bare uppercase token is treated as a declaration. IDs are recognised separately, so a
 * document that uses `FIX-3` without declaring `FIX` is detectable.
 */
/**
 * Every ID a planning surface DECLARES, with the line it was declared on.
 *
 * `readSeries` reduces the same scan to a maximum per prefix, which is what minting the next ID
 * needs. A cross-repo collision check needs the whole set instead - two repositories can collide
 * on any member, not only the highest - so both callers read the SAME DECLARING_POSITIONS list.
 * Do not re-implement the patterns at the call site: a rule assembled from parts in two places
 * drifts silently, and this one decides whether a collision is reported at all.
 */
function declaredIds(file) {
	const text = fs.readFileSync(file, 'utf8');
	const lineOf = (index) => text.slice(0, index).split('\n').length;
	const out = new Map();
	for (const rx of DECLARING_POSITIONS) {
		rx.lastIndex = 0;
		let m;
		while ((m = rx.exec(text)) !== null) {
			const [, prefix, num] = m;
			const n = Number.parseInt(num, 10);
			if (!Number.isFinite(n)) { continue; }
			// Keyed by prefix and NUMBER, never by the text as written. `VS-01` and `VS-1` are the
			// same slice, and a collision check that compares strings would miss exactly the pairs
			// a padding convention was introduced to tidy.
			const key = prefix + '-' + n;
			if (!out.has(key)) { out.set(key, { prefix, num: n, file, line: lineOf(m.index) }); }
		}
	}
	return out;
}

function readSeries(file) {
	const text = fs.readFileSync(file, 'utf8');

	const declared = new Set();
	// True when the ONLY thing that declared was a `Last Num` cell - the legacy MedAR register,
	// whose first column is a human name rather than a prefix. Readable, but still the shape
	// `migrate-project` exists to normalise, so callers can say so instead of silently accepting it.

	// prefix -> { declared, local, frozen, ceiling } as WRITTEN DOWN by the register.
	const scopes = new Map();
	// Two spellings, one meaning. `Prefix` is this toolkit's own; `Series` is what the canonical
	// MedAR template ships, and every MedAR register was therefore read as declaring NOTHING - so
	// the repos with the most carefully maintained registers looked exactly like the repos with
	// none. Accept both rather than asking eight roadmaps to rename a column.
	const headerAt = text.search(/^\|\s*Prefix\s*\|/im);
	if (headerAt !== -1) {
		// Only scan the table that follows the header, to its first blank line.
		const after = text.slice(headerAt);
		const table = after.slice(0, after.search(/\n\s*\n/) === -1 ? after.length : after.search(/\n\s*\n/));
		OWNERSHIP_ROW.lastIndex = 0;
		let m;
		while ((m = OWNERSHIP_ROW.exec(table)) !== null) {
			const prefix = m[1];
			if (!HEADER_WORDS.has(prefix.toUpperCase()) && !/^-+$/.test(prefix)) { declared.add(prefix); }
		}

		// THE FIRST CELL DECLARES, OR NOTHING DOES.
		//
		// An earlier version also mined a prefix out of a `Last Num` cell, so that a register whose
		// column 1 is a human name ("Vertical Slices") still parsed. That taught the checker a
		// second register shape, and then a third, and each one it learns is a shape it will half-
		// accept a fourth version of, silently. One template is cheaper than N parsers, and a
		// non-conforming register should FAIL rather than be guessed at.
		// See docs/design/one-template-beats-three-parsers.md.
		const tableLines = table.split('\n');
		const headerCells = rowCells(tableLines[0] || '');
		const lastUsedAt = headerCells.findIndex((c) => /last\s*used/i.test(c));
		const scopeAt = headerCells.findIndex((c) => /^\s*\**\s*scope\s*\**\s*$/i.test(c));

		// A DECLARED scope beats a guess from the prefix string.
		//
		// `isLocalPrefix` hardcodes one answer for one prefix (FIX), which is right for this
		// toolkit and cannot be right for every register. A repository that has written down what
		// it means should be believed over a Set compiled into the checker.
		//
		// FROZEN is the one that earns its keep. A series can be retired - "mint new work
		// elsewhere, these IDs are historical citations only" - and until now that decision lived
		// entirely in a prose cell no parser read, which made it a convention rather than a
		// control. Measured: MedAR_AI_Runtime froze OPS at 08 and the checker would still have
		// accepted OPS-09 as the next mint.
		if (scopeAt !== -1) {
			for (const line of tableLines.slice(1)) {
				const cells = rowCells(line);
				const scopeCell = (cells[scopeAt] || '').trim();
				const usedCell = lastUsedAt === -1 ? '' : (cells[lastUsedAt] || '');
				if (!scopeCell || /^-+$/.test(scopeCell)) { continue; }

				// Which series is this row about? Its first cell, which is a bare prefix or nothing.
				const first = (cells[0] || '').trim();
				const byFirst = /^([A-Z][A-Z0-9]{0,7})$/.exec(first);
				const prefix = byFirst ? byFirst[1] : null;
				if (!prefix || HEADER_WORDS.has(prefix.toUpperCase())) { continue; }

				const frozen = /frozen|retired|do not mint/i.test(scopeCell);
				const local = /repo-local/i.test(scopeCell);
				// "frozen at 8" carries its own ceiling; otherwise the Last Used cell is it.
				const ceilingMatch = /(\d+)/.exec(frozen ? (scopeCell + ' ' + usedCell) : usedCell);
				scopes.set(prefix, {
					declared: scopeCell,
					local,
					frozen,
					ceiling: ceilingMatch ? Number.parseInt(ceilingMatch[1], 10) : null,
				});
			}
		}
	}

	const used = new Map();
	for (const rx of DECLARING_POSITIONS) {
		rx.lastIndex = 0;
		let m;
		while ((m = rx.exec(text)) !== null) {
			const [, prefix, num] = m;
			const n = Number.parseInt(num, 10);
			if (!Number.isFinite(n)) { continue; }
			// MAX across every declaring position, so a backlog item numbered above the Delivery
			// Index still moves the series forward. Comparison stays numeric: an ID is its number,
			// and padding is a rendering rule that must never reach identity.
			if (!used.has(prefix) || n > used.get(prefix)) { used.set(prefix, n); }
		}
	}

	return { file, declared, used, scopes };
}

/**
 * Highest number used for `prefix` across the given roadmaps.
 *
 * MAX, never a count. Counting rows agrees with the highest ID only while a series is contiguous,
 * and starts handing out taken numbers the moment one is retired.
 */
function lastNumber(root, prefix, specs) {
	let highest = 0;
	for (const file of roadmapFiles(root, specs)) {
		const { used } = readSeries(file);
		const n = used.get(prefix);
		if (n !== undefined && n > highest) { highest = n; }
	}
	return highest;
}

/**
 * Prefixes used somewhere but declared nowhere, per roadmap.
 *
 * This is what makes the ownership table mean something. Without it the table is a comment, and a
 * document can quietly mint `FIX-1` in a series nobody owns.
 */
function undeclaredPrefixes(root, specs) {
	// Declaration is REPOSITORY-scoped, not per-file. A backlog is a satellite of the roadmap
	// beside it and mints into the same series; requiring it to carry its own ownership table
	// would mean two registers for one set of prefixes, which is the drift this tool exists to
	// stop. So the union of every planning surface declares, and any surface may use.
	const files = roadmapFiles(root, specs);
	const read = files.map((file) => ({ file, ...readSeries(file) }));
	const declaredAnywhere = new Set(read.flatMap((r) => [...r.declared]));

	const problems = [];
	for (const r of read) {
		for (const prefix of r.used.keys()) {
			if (!declaredAnywhere.has(prefix)) {
				problems.push({ file: r.file, prefix, highest: r.used.get(prefix) });
			}
		}
	}
	return problems;
}

/** Every prefix declared across the roadmaps, with the file that claims it. */
function declaredOwnership(root, specs) {
	const owners = new Map();
	for (const file of roadmapFiles(root, specs)) {
		for (const prefix of readSeries(file).declared) {
			if (!owners.has(prefix)) { owners.set(prefix, []); }
			owners.get(prefix).push(file);
		}
	}
	return owners;
}

module.exports = {
	DEFAULT_ROADMAPS,
	LOCAL_PREFIXES,
	isLocalPrefix,
	declaredIds,
	DECLARING_POSITIONS,
	roadmapFiles,
	readSeries,
	lastNumber,
	undeclaredPrefixes,
	declaredOwnership,
};
