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
const { blankFences } = require('./fence');

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
/**
 * Code spans - stripped before looking, or every example path is a false hit.
 *
 * Fenced BLOCKS are no longer a regex here. `/```[\s\S]*?```/` closed a ```` block at the first ``` inside
 * it, so an example link after that line was checked as though it were live. Blocks go through
 * lib/fence.js, the one grammar every tool shares.
 */
const CODE_SPAN = /`[^`\n]*`/g;

/**
 * A leading `---` block is FRONTMATTER: field values, not the document's own prose.
 *
 * Scanning it finds markup that was never a link in this file. A `doc:` field carrying
 * `[DOCS-051][docs-051]` is correct as DATA - the definition lives in the REGISTER, where that cell
 * renders - and `links` reported it as an undefined reference in the document that merely carries
 * it. Same root as `DOCS-052`: only the two components that CONSUME slice documents knew the format
 * existed, while every component that PROCESSES documents did not. Fenced code is stripped for the
 * same reason, which is why this belongs beside it rather than as a special case.
 *
 * Anchored to the start, and the closing fence must be a complete line - matching `lib/frontmatter.js`.
 */
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/;

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
/**
 * `https://github.com/<owner>/<repo>/blob/<ref>/<path>` -> its parts, or null.
 *
 * The path is returned DECODED and without its query or fragment, because that is what the relative
 * half is compared as: it is URI-decoded and its #fragment dropped before it resolves. Comparing the
 * GitHub half raw made `My%20File.md` and `X.md#heading` read as having no twin. Codex on PR #5.
 */
function parseGithub(url) {
	const m = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/blob\/([^/\s]+)\/([^\s?#]+)/i.exec(url);
	if (!m) { return null; }
	let p = m[4];
	try { p = decodeURIComponent(p); } catch { /* a malformed escape is compared as written */ }
	return { repo: m[2], path: p };
}

/** Forward slashes. Case is NOT folded here - see twinOf for which parts may ignore it. */
function slashes(p) {
	return String(p).replace(/\\/g, '/');
}

/**
 * Does this resolved path leave the repository?
 *
 * By SEGMENT, not by prefix. `rel.startsWith('..')` also matched a file named `..config.md` at the
 * root, which then failed for lacking a GitHub twin instead of being checked on disk. Codex, PR #5.
 */
function escapesRepo(root, resolved) {
	const rel = path.relative(root, resolved);
	return rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
}

/**
 * Is this cross-repo relative link backed by a GitHub twin in the same file?
 *
 * The house convention writes every cross-repo reference TWICE: a relative definition for an agent
 * reading the filesystem, and a GitHub URL for the web. The two are independent statements of one
 * fact, so they can be checked against EACH OTHER - offline, deterministically, from any checkout.
 *
 * Compared on REPOSITORY NAME plus PATH, never on owner. The local folder above a repository is a
 * layout choice (`Programs_MedAR/DevTools`) and the GitHub owner is not (`MedARMS/DevTools`), so an
 * owner comparison would fail every correct MedAR twin.
 *
 * CASE: the PATH must match exactly, the REPOSITORY NAME need not. Git tree paths are case-sensitive,
 * so a twin ending `docs/x.md` beside a link to `docs/X.md` is a broken web link - folding both to
 * lower case passed it, which is the wrong-case defect `links` catches everywhere else (Codex, PR #5).
 * A repository name is different: the local folder may be `devtools` for `DevTools`, and GitHub
 * resolves a repository name in either case.
 *
 *   'ok'     a twin names this repository and exactly this path
 *   'drift'  a twin names the same file, but a different repository, path, or casing
 *   'none'   nothing in the file could be this link's twin
 */
function twinOf(resolved, twins) {
	const here = slashes(resolved);
	let drift = false;
	for (const t of twins) {
		const tail = `/${t.path}`;
		if (here.endsWith(tail)) {
			const beforePath = here.slice(0, here.length - tail.length);
			if (beforePath.toLowerCase().endsWith(`/${t.repo}`.toLowerCase())) { return 'ok'; }
		}
		// The filename, ignoring case, is enough to recognise the link this twin was MEANT to pair with.
		if (here.toLowerCase().endsWith(`/${path.posix.basename(t.path)}`.toLowerCase())) { drift = true; }
	}
	return drift ? 'drift' : 'none';
}

function checkLinks(root, { skipDirs = DEFAULT_SKIP, orphanRoot = 'docs' } = {}) {
	const problems = [];
	const linked = new Set();
	let checked = 0;
	// Cross-repo targets are COUNTED, not resolved. See the loop below.
	let unverified = 0;

	for (const file of markdownFiles(root, skipDirs)) {
		const source = fs.readFileSync(file, 'utf8');
		const text = blankFences(source.replace(FRONTMATTER, '')).replace(CODE_SPAN, '');
		const dir = path.dirname(file);
		const where = path.relative(root, file).replace(/\\/g, '/');

		// Long URLs live in reference definitions rather than inline, so a source line is as wide as
		// it renders. Both forms have to be checked, or moving a link out of the prose hides it.
		const targets = [];
		const defined = new Set();
		let m;

		// A GitHub twin counts in EITHER form. Collecting them only from reference definitions made an
		// inline `[🔗](https://github.com/...)` invisible, and its relative half failed as twin-less.
		// `links` runs independently of `format`, so it cannot assume the inline form was moved. Codex.
		const twins = [];
		// A twin in FRONTMATTER counts too. Migration moves a row's other cells into frontmatter and its Status
		// into the body, so a twin from another cell of the same row now sits there. Frontmatter is never
		// link-CHECKED (DOCS-052); a twin is evidence for the relative half, not a link to resolve (DOCS-065).
		const head = FRONTMATTER.exec(source);
		for (const url of (head ? head[0] : '').match(/https:\/\/github\.com\/[^\s)'"\]>]+/g) || []) {
			const gh = parseGithub(url);
			if (gh) { twins.push(gh); }
		}
		LINK.lastIndex = 0;
		while ((m = LINK.exec(text)) !== null) {
			targets.push(m[1]);
			const gh = parseGithub(m[1].trim().split(/\s+/)[0]);
			if (gh) { twins.push(gh); }
		}

		DEFINITION.lastIndex = 0;
		while ((m = DEFINITION.exec(text)) !== null) {
			defined.add(m[1].toLowerCase());
			targets.push(m[2]);
			const gh = parseGithub(m[2]);
			if (gh) { twins.push(gh); }
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

			const resolved = path.resolve(dir, decodeURIComponent(target));

			// A TARGET OUTSIDE THIS REPOSITORY IS UNVERIFIED - UNCONDITIONALLY. `DOCS-051`.
			//
			// It cannot be checked from a single-repo checkout, which is what CI has: no sibling repo
			// exists there, so every one read as dead and CI was red on links that were correct.
			// Reporting that as a failure is the shape `DOCS-048` ruled out - an unreachable sibling
			// is a THIRD outcome, neither pass nor fail.
			//
			// And it must not depend on what happens to be on disk. Resolving it when the sibling is
			// cloned and skipping it when it is not gives ONE link TWO verdicts depending on whose
			// machine asks, and makes `check` a machine-dependent oracle. So it is never resolved,
			// anywhere. What CAN be checked offline is its twin, and that is checked instead.
			//
			// Never fetched either: resolving the GitHub twin over the network turns a slow runner,
			// a rate limit or a private sibling into "this link is dead", which is the same defect.
			if (escapesRepo(root, resolved)) {
				unverified++;
				const verdict = twinOf(resolved, twins);
				if (verdict === 'none') {
					problems.push({ file: where, target: raw, why: 'cross-repo link with no GitHub twin in this file' });
				} else if (verdict === 'drift') {
					problems.push({ file: where, target: raw, why: 'its GitHub twin names a different repository or path' });
				}
				continue;
			}

			checked++;
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

	return { checked, unverified, problems, orphans };
}

module.exports = { checkLinks, markdownFiles, DEFAULT_SKIP };
