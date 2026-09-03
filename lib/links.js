'use strict';
// Verify that documentation links point at something real, and that every document can be reached.
//
// WHY. Two READMEs once drifted until both were empty and nobody noticed for a year. Neither failure
// was hard to find - they were hard to NOTICE, because nothing was looking. Four things get checked:
//
//   - a link to a file that does not exist
//   - a link whose CASE is wrong. Windows and macOS resolve it happily; GitHub and Linux do not, so
//     it works on every machine that could catch it and breaks for every reader
//   - a [text][label] with no matching definition, which renders as literal brackets forever
//   - a document nothing links to, which stays correct and unread until it quietly goes stale

const fs = require('fs');
const path = require('path');

// `archive` and `scratch` are present on purpose and are not part of the documentation graph.
// An archive records the past; a scratch note is working material - a review, a paste, a
// half-thought. Neither should be reformatted, and neither is an orphan for not being linked.
// project_v2 is the migration staging area migrate-project writes into. It is generated, it is
// gitignored, and it is deleted the moment a repo adopts the shape - so an orphan report about it
// is a false gate on every repo that runs a migration. Its links are still worth getting right,
// which is why the emitter carrying its own reference definitions is pinned by a test instead.
const DEFAULT_SKIP = ['node_modules', '.git', 'dist', 'out', '.vscode-test', 'archive', 'scratch',
	'coverage', 'project_v2'];

/** Inline links and images: [text](target). */
const LINK = /!?\[[^\]]*\]\(([^)]+)\)/g;
/** Reference definitions: [label]: target. */
const DEFINITION = /^[ \t]{0,3}\[([^\]]+)\]:[ \t]*(\S+)/gm;
/** Reference uses: [text][label], and the collapsed [label][] form. */
const USE = /\[([^\]]+)\]\[([^\]]*)\](?!:)/g;
/** Fenced blocks and code spans - stripped before looking, or every example path is a false hit. */
const FENCE = /```[\s\S]*?```|`[^`\n]*`/g;

function markdownFiles(dir, skip, found = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (!skip.includes(entry.name)) { markdownFiles(path.join(dir, entry.name), skip, found); }
		} else if (entry.name.endsWith('.md')) {
			found.push(path.join(dir, entry.name));
		}
	}
	return found;
}

function isExternal(target) {
	return /^(https?:|mailto:|#)/i.test(target);
}

/**
 * Does this path exist with exactly the case that was written?
 *
 * fs.existsSync says yes on a case-insensitive filesystem regardless, so walk the path and confirm
 * each segment against the real directory listing.
 */
function existsWithExactCase(target, root) {
	let current = target;
	while (current !== root && current !== path.dirname(current)) {
		const parent = path.dirname(current);
		if (!fs.readdirSync(parent).includes(path.basename(current))) { return false; }
		current = parent;
	}
	return true;
}

/**
 * Check a documentation tree.
 *
 * @param {string} root        repository root
 * @param {object} options
 * @param {string[]} options.skipDirs      directory names never descended into
 * @param {string}   options.orphanRoot    directory whose documents must all be reachable
 * @returns {{checked: number, problems: object[], orphans: string[]}}
 */
function checkLinks(root, { skipDirs = DEFAULT_SKIP, orphanRoot = 'docs' } = {}) {
	const problems = [];
	const linked = new Set();
	let checked = 0;

	for (const file of markdownFiles(root, skipDirs)) {
		const text = fs.readFileSync(file, 'utf8').replace(FENCE, '');
		const dir = path.dirname(file);
		const where = path.relative(root, file).replace(/\\/g, '/');

		// Long URLs live in reference definitions rather than inline, so a source line is as wide as
		// it renders. Both forms have to be checked, or moving a link out of the prose hides it.
		const targets = [];
		const defined = new Set();
		let m;

		LINK.lastIndex = 0;
		while ((m = LINK.exec(text)) !== null) { targets.push(m[1]); }

		DEFINITION.lastIndex = 0;
		while ((m = DEFINITION.exec(text)) !== null) {
			defined.add(m[1].toLowerCase());
			targets.push(m[2]);
		}

		USE.lastIndex = 0;
		while ((m = USE.exec(text)) !== null) {
			const label = (m[2] || m[1]).toLowerCase();
			if (!defined.has(label)) {
				problems.push({ file: where, target: `[${m[1]}][${m[2]}]`, why: 'undefined reference' });
			}
		}

		for (const rawTarget of targets) {
			const raw = rawTarget.trim().split(/\s+/)[0];
			if (!raw || isExternal(raw)) { continue; }

			// Drop any anchor; we check that the FILE exists, not the heading.
			const target = raw.split('#')[0];
			if (!target) { continue; }

			checked++;
			const resolved = path.resolve(dir, decodeURIComponent(target));
			linked.add(resolved.toLowerCase());

			if (!fs.existsSync(resolved)) {
				problems.push({ file: where, target: raw, why: 'does not exist' });
			} else if (!existsWithExactCase(resolved, root)) {
				problems.push({ file: where, target: raw, why: 'wrong case' });
			}
		}
	}

	// A link to a DIRECTORY makes everything under it reachable, since an index may point at
	// `design/` rather than listing every file in it.
	const orphanDir = path.join(root, orphanRoot);
	const orphans = fs.existsSync(orphanDir)
		? markdownFiles(orphanDir, skipDirs)
			.filter(f => {
				let current = f;
				while (current !== root) {
					if (linked.has(current.toLowerCase())) { return false; }
					current = path.dirname(current);
				}
				return true;
			})
			.map(f => path.relative(root, f).replace(/\\/g, '/'))
		: [];

	return { checked, problems, orphans };
}

module.exports = { checkLinks, markdownFiles, DEFAULT_SKIP };
