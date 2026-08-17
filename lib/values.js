'use strict';
// Keep computed numbers in documentation honest.
//
// A doc that says "63 tests passing" when there are 111 is not slightly wrong, it is evidence that
// nobody has read that paragraph in a year. The number should come from the thing it describes.
//
// MARKER SYNTAX. HTML comments, not braces:
//
//   Quality gates: ESLint, TypeScript, <!--ewc3:tests-->111<!--/ewc3:tests--> tests
//
// Braces (`{tests}`) were rejected because our docs are full of JSON, JSONC settings blocks and
// template literals, and a placeholder that collides with real content in the same file is a
// find-and-replace accident waiting to happen. HTML comments cannot collide: they are invisible when
// rendered, legal anywhere in markdown, and - the part that matters - THE CURRENT VALUE STAYS
// VISIBLE between them. A reader with no tooling sees `111 tests`, not a broken placeholder.
//
// The same marker works inline or around a whole block, which is how badge lines are handled: a URL
// cannot contain an HTML comment, so the entire badge sits between markers and is regenerated.

const fs = require('fs');
const path = require('path');
const { expand } = require('./glob');
const { lastNumber } = require('./series');

/** Build the open/close markers for a name. */
function markers(name) {
	return {
		open: `<!--ewc3:${name}-->`,
		close: `<!--/ewc3:${name}-->`
	};
}

/** Every value reference found in a string, with its current content. */
function findMarkers(text) {
	const found = [];
	const re = /<!--ewc3:([a-zA-Z0-9_.-]+)-->([\s\S]*?)<!--\/ewc3:\1-->/g;
	let m;
	while ((m = re.exec(text)) !== null) {
		found.push({ name: m[1], current: m[2], index: m.index });
	}
	return found;
}

// --- resolvers -------------------------------------------------------------
//
// A value is declared in config as one of these. Each returns a string.

const RESOLVERS = {
	/** A literal, for values with no better source yet. */
	literal({ value }) {
		return String(value);
	},

	/**
	 * Build a string from other values: {"text": "tests-${tests}-brightgreen"}.
	 *
	 * This is how a whole line is regenerated - a badge URL cannot contain an HTML comment, so the
	 * marker goes AROUND the line and this rebuilds it. Braces are fine here: this is config, not
	 * prose, so there is no JSON or template literal in the same file to collide with.
	 */
	template({ text }, root, resolved) {
		return text.replace(/\$\{([a-zA-Z0-9_.-]+)\}/g, (whole, name) => {
			if (!(name in resolved)) {
				throw new Error(`template refers to "${name}", which is not declared (or is itself a template)`);
			}
			return resolved[name];
		});
	},

	/** A field from a JSON file: {"file": "package.json", "path": "version"}. */
	fromJson({ file, path: dotted }, root) {
		const data = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
		const value = dotted.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), data);
		if (value == null) { throw new Error(`fromJson: ${file} has no ${dotted}`); }
		return String(value);
	},

	/** Count keys under a JSON object: {"file": "package.json", "path": "contributes.commands"}. */
	countJson({ file, path: dotted }, root) {
		const data = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
		const value = dotted.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), data);
		if (value == null) { throw new Error(`countJson: ${file} has no ${dotted}`); }
		return String(Array.isArray(value) ? value.length : Object.keys(value).length);
	},

	/**
	 * Count regex matches across files: {"files": ["test/*.ts"], "pattern": "^\\s*(test|it)\\("}.
	 *
	 * Counts what is DECLARED, which is not always what a runner reports - a conditional skip is
	 * declared but pending. Name the value for what it counts (`tests`, not `testsPassing`) and the
	 * number stays true.
	 */
	countMatches({ files, pattern, flags = 'gm' }, root) {
		const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
		let total = 0;
		for (const spec of files) {
			for (const file of expand(spec, root)) {
				const text = fs.readFileSync(file, 'utf8');
				total += (text.match(re) || []).length;
			}
		}
		return String(total);
	},

	/**
	 * The HIGHEST number captured across files: {"files": [...], "pattern": "^\| PQ-(\d+)"}.
	 *
	 * For allocating the next ID in a series. A roadmap's "last number" cell is the INPUT to minting
	 * an ID, so when it goes stale it hands the next person a number that is already taken - which is
	 * worse than an out-of-date summary, because the collision is silent.
	 *
	 * Deliberately MAX and not a count. Counting matches happens to give the right answer while a
	 * series is contiguous, and starts lying the moment one entry is retired - a wrong number that
	 * looks derived is worse than an obviously stale one.
	 *
	 * Capture group 1 if the pattern has one, otherwise the whole match. Returns "0" when nothing
	 * matches, so a broken pattern shows up as an absurd value rather than as a plausible ID.
	 */
	/**
	 * The last number used for an ID prefix: {"prefix": "PQ"}.
	 *
	 * Defaults to the roadmaps under `docs/project/`, so the common case needs only the prefix.
	 * Override with `files` when they live somewhere else.
	 *
	 * Prefer this over a hand-written `maxMatch` pattern: it reads the roadmap's own ID tables, and
	 * `ewc3-docs series` will additionally refuse a prefix the roadmap has not declared it owns.
	 */
	lastId({ prefix, files }, root) {
		if (!prefix) { throw new Error('lastId: a "prefix" is required, e.g. {"prefix": "PQ"}'); }
		return String(lastNumber(root, prefix, files));
	},

	maxMatch({ files, pattern, flags = 'gm' }, root) {
		const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
		let highest = 0;
		for (const spec of files) {
			for (const file of expand(spec, root)) {
				const text = fs.readFileSync(file, 'utf8');
				for (const m of text.matchAll(re)) {
					const n = Number.parseInt(m[1] !== undefined ? m[1] : m[0], 10);
					if (Number.isFinite(n) && n > highest) { highest = n; }
				}
			}
		}
		return String(highest);
	}
};

/**
 * Resolve every declared value. Returns {name: string}.
 *
 * Plain values resolve first so that templates can refer to them. Templates cannot refer to other
 * templates - one level keeps the ordering obvious and the failure message honest.
 */
function resolveValues(config, root) {
	const entries = Object.entries(config.values || {});
	const out = {};

	const resolveOne = ([name, spec]) => {
		const kind = Object.keys(spec).find(k => RESOLVERS[k]);
		if (!kind) {
			throw new Error(`value "${name}": no known resolver (have: ${Object.keys(RESOLVERS).join(', ')})`);
		}
		out[name] = RESOLVERS[kind](spec[kind], root, out);
	};

	entries.filter(([, spec]) => !spec.template).forEach(resolveOne);
	entries.filter(([, spec]) => spec.template).forEach(resolveOne);
	return out;
}

/** Substitute resolved values into one string. Returns {text, replaced, unknown}. */
function applyToText(text, values) {
	const unknown = [];
	let replaced = 0;

	const next = text.replace(
		/<!--ewc3:([a-zA-Z0-9_.-]+)-->([\s\S]*?)<!--\/ewc3:\1-->/g,
		(whole, name, current) => {
			if (!(name in values)) { unknown.push(name); return whole; }
			const { open, close } = markers(name);
			const wanted = open + values[name] + close;
			if (whole !== wanted) { replaced++; }
			return wanted;
		}
	);
	return { text: next, replaced, unknown };
}

/** Apply to files. Returns {changed: [], unknown: []}. */
function syncFiles(files, values, { check = false } = {}) {
	const changed = [];
	const unknown = new Set();

	for (const file of files) {
		const before = fs.readFileSync(file, 'utf8');
		const result = applyToText(before, values);
		result.unknown.forEach(n => unknown.add(n));

		if (result.text !== before) {
			changed.push(file.replace(/\\/g, '/'));
			if (!check) { fs.writeFileSync(file, result.text); }
		}
	}
	return { changed, unknown: [...unknown] };
}

module.exports = { markers, findMarkers, resolveValues, applyToText, syncFiles, RESOLVERS };
