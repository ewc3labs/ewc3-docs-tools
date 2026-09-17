'use strict';
// Git as the baseline for "was this row hand-edited?" - DOCS-056.
//
// After a repository adopts slice documents, its Delivery Index is GENERATED, and a row can differ
// from what its document renders for two opposite reasons: the document changed (render it), or
// someone typed into the row (refuse, or the edit is silently discarded). Comparing the row with its
// document cannot tell those apart. Git can: it knows what the row was before either happened.
//
// EVERYTHING HERE GOES THROUGH `git rev-parse` / `git show`, NEVER `fs.stat('.git')`. In a linked
// worktree `.git` is a FILE, so a directory test reports "not a repository" in exactly the setup the
// estate standardises on for branch work (LabsHQ control G).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function git(repo, args) {
	try {
		const out = execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
		return { ok: true, out: out.replace(/\n$/, '') };
	} catch {
		return { ok: false, out: '' };
	}
}

/**
 * An absolute path for a `git rev-parse --git-path` entry. Per worktree for everything used here.
 *
 * `--path-format` is git 2.31+. An older rev-parse echoes the unknown option back as output rather than
 * failing, so a null or a non-path here would silently switch off merge detection and the last-written
 * record (Copilot, PR #6). Anything that is not one absolute path falls back to the plain form, which
 * is relative to the directory git ran in.
 */
function gitPath(repo, name) {
	const abs = git(repo, ['rev-parse', '--path-format=absolute', '--git-path', name]);
	if (abs.ok && !abs.out.includes('\n') && path.isAbsolute(abs.out)) { return abs.out; }
	const plain = git(repo, ['rev-parse', '--git-path', name]);
	return plain.ok && plain.out ? path.resolve(repo, plain.out.split('\n').pop()) : null;
}

/**
 * Whether a git baseline can be trusted right now, and why not when it cannot.
 *
 * Two different hazards, refused by different gates (LabsHQ controls H and I, refined by Codex on PR #6):
 *
 *   operation  a merge, rebase, cherry-pick or revert is in progress. HEAD is then the wrong baseline -
 *              mid-rebase it is the commit being replayed ONTO, so every row of the commit being applied
 *              looks hand-edited. `--write` refuses; `--check` does not use HEAD and need not.
 *   conflicts  unmerged paths. The tree may hold conflict markers, so ANY reading of it is a confident
 *              diagnosis of the wrong thing. Both refuse, whatever operation left them.
 *
 * `ok` means neither. `reason` names the first that applies.
 */
function state(repo) {
	if (!git(repo, ['rev-parse', '--is-inside-work-tree']).ok) {
		return { ok: false, git: false, reason: 'not a git work tree - a hand edit cannot be told from a render without one' };
	}
	const exists = (name) => { const p = gitPath(repo, name); return Boolean(p && fs.existsSync(p)); };
	let operation = null;
	for (const [name, what] of [['MERGE_HEAD', 'merge'], ['CHERRY_PICK_HEAD', 'cherry-pick'], ['REVERT_HEAD', 'revert'],
		['rebase-merge', 'rebase'], ['rebase-apply', 'rebase']]) {
		if (exists(name)) { operation = what; break; }
	}
	// `git diff` covers the whole tree from any subdirectory; `ls-files -u` would only see below it.
	const unmerged = git(repo, ['diff', '--name-only', '--diff-filter=U']);
	const conflicts = unmerged.ok && unmerged.out.length > 0;
	const head = git(repo, ['rev-parse', 'HEAD']);
	const reason = conflicts
		? `unresolved conflicts${operation ? ` (${operation} in progress)` : ''} - resolve them first`
		: operation ? `${operation} in progress - finish or abort it first` : null;
	return { ok: !operation && !conflicts, git: true, operation, conflicts, reason, head: head.ok ? head.out : null };
}

/** The committed text of `file` at HEAD, or null when it is not committed (untracked, or no HEAD). */
function headText(repo, file) {
	const rel = path.relative(repo, file).split(path.sep).join('/');
	// `./` resolves against the working directory, so a --repo below the top level still finds the file.
	const r = git(repo, ['show', `HEAD:./${rel}`]);
	return r.ok ? r.out : null;
}

/**
 * The rows `index --write` last wrote, per file, valid only for the HEAD they were written against.
 *
 * LabsHQ finding 3: with HEAD as the only baseline, render, edit the document again, render again
 * REFUSES - the first render already made the row differ from HEAD, and HEAD cannot tell a render
 * from a hand edit. The tool has to remember what it wrote. Stored outside the tree, per worktree,
 * never committed. Discarded when HEAD moves, because after a commit the committed rows are the
 * baseline again and a stale record from another branch must never vouch for a row.
 */
function loadLastWritten(repo, head) {
	const p = gitPath(repo, 'ewc3-docs/index-last.json');
	if (!p || !fs.existsSync(p)) { return {}; }
	try {
		const data = JSON.parse(fs.readFileSync(p, 'utf8'));
		return data && data.head === head && data.files ? data.files : {};
	} catch {
		return {};
	}
}

function saveLastWritten(repo, head, files) {
	const p = gitPath(repo, 'ewc3-docs/index-last.json');
	if (!p) { return; }
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, JSON.stringify({ head, files }, null, 2));
}

/** The full shas on HEAD that are not reachable from `rev`, or null when `rev` is not a commit. */
function commitsSince(repo, rev) {
	if (!git(repo, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]).ok) { return null; }
	const r = git(repo, ['rev-list', `${rev}..HEAD`]);
	return r.ok ? new Set(r.out.split('\n').filter(Boolean)) : null;
}

module.exports = { state, headText, loadLastWritten, saveLastWritten, commitsSince };
