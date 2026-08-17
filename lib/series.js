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
const DEFAULT_ROADMAPS = ['docs/project/*Roadmap.md', 'docs/project/*ROADMAP.md'];

/** A row in the ownership table: `| PQ | owner | description |`. */
const OWNERSHIP_ROW = /^\|\s*([A-Z][A-Z0-9]{0,7})\s*\|\s*([^|]+?)\s*\|/gm;

/** Any ID used in a table cell: `| PQ-34 | ...`. */
const ID_IN_TABLE = /^\|\s*([A-Z][A-Z0-9]{0,7})-(\d+)\s*\|/gm;

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
function readSeries(file) {
	const text = fs.readFileSync(file, 'utf8');

	const declared = new Set();
	const headerAt = text.search(/^\|\s*Prefix\s*\|/im);
	if (headerAt !== -1) {
		// Only scan the table that follows the header, to its first blank line.
		const after = text.slice(headerAt);
		const table = after.slice(0, after.search(/\n\s*\n/) === -1 ? after.length : after.search(/\n\s*\n/));
		OWNERSHIP_ROW.lastIndex = 0;
		let m;
		while ((m = OWNERSHIP_ROW.exec(table)) !== null) {
			const prefix = m[1];
			if (prefix !== 'PREFIX' && !/^-+$/.test(prefix)) { declared.add(prefix); }
		}
	}

	const used = new Map();
	ID_IN_TABLE.lastIndex = 0;
	let m;
	while ((m = ID_IN_TABLE.exec(text)) !== null) {
		const [, prefix, num] = m;
		const n = Number.parseInt(num, 10);
		if (!Number.isFinite(n)) { continue; }
		if (!used.has(prefix) || n > used.get(prefix)) { used.set(prefix, n); }
	}

	return { file, declared, used };
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
	const problems = [];
	for (const file of roadmapFiles(root, specs)) {
		const { declared, used } = readSeries(file);
		for (const prefix of used.keys()) {
			if (!declared.has(prefix)) { problems.push({ file, prefix, highest: used.get(prefix) }); }
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
	roadmapFiles,
	readSeries,
	lastNumber,
	undeclaredPrefixes,
	declaredOwnership,
};
