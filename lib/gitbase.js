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

/** An absolute path for a `git rev-parse --git-path` entry. Per worktree for everything used here. */
function gitPath(repo, name) {
	const r = git(repo, ['rev-parse', '--path-format=absolute', '--git-path', name]);
	return r.ok ? r.out : null;
}

/**
 * Whether a git baseline can be trusted right now, and why not when it cannot.
 *
 * Mid-merge and mid-rebase states are refused rather than diagnosed (LabsHQ controls H and I). During
 * a merge the register may hold conflict markers; during a rebase HEAD is the commit being replayed
 * ONTO, so every row from the commit being applied looks hand-edited. Naming ids in either state
 * would be a confident diagnosis of the wrong thing.
 */
function state(repo) {
	if (!git(repo, ['rev-parse', '--is-inside-work-tree']).ok) {
		return { ok: false, git: false, reason: 'not a git work tree - a hand edit cannot be told from a render without one' };
	}
	const exists = (name) => { const p = gitPath(repo, name); return Boolean(p && fs.existsSync(p)); };
	// A cherry-pick or revert stopped on a conflict leaves the same markers in the tree a merge does.
	for (const [name, what] of [['MERGE_HEAD', 'merge'], ['CHERRY_PICK_HEAD', 'cherry-pick'], ['REVERT_HEAD', 'revert']]) {
		if (exists(name)) { return { ok: false, git: true, reason: `${what} in progress - finish or abort it first` }; }
	}
	if (exists('rebase-merge') || exists('rebase-apply')) {
		return { ok: false, git: true, reason: 'rebase in progress - finish or abort it first' };
	}
	const head = git(repo, ['rev-parse', 'HEAD']);
	return { ok: true, git: true, head: head.ok ? head.out : null };
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

module.exports = { state, headText, loadLastWritten, saveLastWritten };
