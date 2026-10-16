'use strict';
// `ewc3-docs hook install | uninstall` (DOCS-092): the commit-msg hook, so a repository checks every commit message
// and its staged slice documents before the commit exists - the "cannot forget" layer, with no wrapper required.
//
// What it will not do, each a way a helper becomes a hazard:
//   - OVERWRITE A HOOK IT DID NOT WRITE. A commit-msg hook may be somebody's whole workflow. It refuses, names the
//     file, and gives the one line to add to it instead. There is no --force: nothing here may discard their code.
//   - INSTALL WHERE GIT DOES NOT LOOK. The directory is git's own answer (`git rev-parse --git-path hooks`), so
//     `core.hooksPath` and linked worktrees are honoured rather than writing to a .git/hooks that nothing runs.
//   - PASS SILENTLY. At commit time the hook looks for ewc3-docs in the repository's node_modules, then where it was
//     installed from, then on PATH.
//
// WHAT BLOCKS, AND WHAT ONLY WARNS. The hook is the convenience layer; `fold --check --since <merge-base>` in CI is
// the gate. So the hook blocks a commit only for a FINDING (exit 1) - a bad trailer, an unnamed staged document. When
// it CANNOT CHECK - the tool is not on this machine, or the check did not run (exit 2: an unreadable legend, say) - it
// warns loudly and lets the commit through, naming CI as what still enforces. Blocking there left one way out,
// `--no-verify`, which agents are forbidden to use; and an unreadable legend blocked the very commit that fixes it
// (raised downstream, before the fleet installed it). `hook install --strict` blocks in both cases too, for a
// repository with no CI gate; the choice is made at install and sealed into the hook, not read from a config file.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const MARK = '# ewc3-docs commit-msg hook';
const SEAL = '# ewc3-docs-sha256: ';

function git(repo, args) {
	return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/** Where git runs this repository's commit-msg hook from, or null outside a work tree. */
function hookFile(repo) {
	let dir;
	try { dir = git(repo, ['rev-parse', '--git-path', 'hooks']); } catch { return null; }
	return path.join(path.resolve(repo, dir), 'commit-msg');
}

/** A path inside single quotes for sh, forward slashes so Git for Windows' sh reads a Windows path. */
function shQuote(p) {
	return `'${String(p).split(path.sep).join('/').replace(/'/g, `'\\''`)}'`;
}

/** sha256 of a hook's text with its seal line removed. */
function sealOf(text) {
	return crypto.createHash('sha256').update(text.split('\n').filter((l) => !l.startsWith(SEAL)).join('\n')).digest('hex');
}

/**
 * True only for a hook this tool wrote AND nobody has edited since. The marker alone is not ownership: a user who
 * added a check to a generated hook keeps the marker, and treating that file as ours replaced or deleted their edit
 * (Codex P1, PR #50). So the hook carries a seal - the hash of its own text - and only an intact seal is ours.
 */
function isOurs(text) {
	const line = text.split('\n').find((l) => l.startsWith(SEAL));
	return Boolean(line) && text.includes(MARK) && line.slice(SEAL.length).trim() === sealOf(text);
}

/** The hook's text: POSIX sh, LF only, sealed. `script` and `node` are where THIS ewc3-docs runs from, the second choice. */
function hookText(script, node, { strict = false } = {}) {
	// Cannot check: warn and pass (CI enforces), or under --strict block with the same words.
	const skipped = strict
		? ['  echo "ewc3-docs commit-msg hook (strict): $1 - this commit is blocked. Bypass visibly: git commit --no-verify" >&2', '  exit 1']
		: ['  echo "ewc3-docs commit-msg hook: $1 - trailer check SKIPPED; CI enforces it." >&2', '  exit 0'];
	const body = [
		'#!/bin/sh',
		`${MARK} (DOCS-092). Installed by \`ewc3-docs hook install${strict ? ' --strict' : ''}\`; \`ewc3-docs hook uninstall\` removes it.`,
		`# Blocks a commit whose message or staged slice documents fail the check. ${strict ? 'Strict: also blocks when the check cannot run.' : 'When the check cannot run, warns and lets it through: CI is the gate.'}`,
		'cannot_check() {',
		...skipped,
		'}',
		'msg="$1"',
		'root=$(git rev-parse --show-toplevel) || cannot_check "not inside a git work tree"',
		'if [ -x "$root/node_modules/.bin/ewc3-docs" ]; then',
		'  set -- "$root/node_modules/.bin/ewc3-docs"',
		`elif [ -f ${shQuote(script)} ]; then`,
		`  if command -v node >/dev/null 2>&1; then set -- node ${shQuote(script)}; else set -- ${shQuote(node)} ${shQuote(script)}; fi`,
		'elif command -v ewc3-docs >/dev/null 2>&1; then',
		'  set -- ewc3-docs',
		'else',
		'  cannot_check "ewc3-docs not found (node_modules/.bin, where it was installed from, PATH)"',
		'fi',
		'"$@" fold --check-message "$msg" --staged --repo "$root"',
		'code=$?',
		// Exit 1 is the ONLY finding. 2 is did-not-run; 126/127 is a tool that could not even start (an interpreter
		// gone from a shebang) - both "cannot check", or the default hook blocks again (Codex, PR #51).
		'[ "$code" -eq 0 ] && exit 0',
		'[ "$code" -eq 1 ] && exit 1',
		'cannot_check "the check did not run (exit $code; reason above)"',
		'',
	].join('\n');
	const lines = body.split('\n');
	lines.splice(2, 0, `${SEAL}${sealOf(body)}`);
	return lines.join('\n');
}

/**
 * Install or update the hook. Returns { code, message }: 0 installed / updated / already current; 2 did not run -
 * not a work tree, or a commit-msg hook this tool did not write.
 */
/**
 * The line to add to a commit-msg hook this tool will not replace - with the SAME rules as the hook it would have
 * installed: only a finding (exit 1) blocks unless strict. `|| exit $?` blocked on a missing tool and on exit 2, so a
 * repository following the advice got strict behaviour it never chose (Codex, PR #51).
 */
function snippet(strict) {
	return strict
		? 'ewc3-docs fold --check-message "$1" --staged || exit 1'
		: 'ewc3-docs fold --check-message "$1" --staged; c=$?; [ "$c" -eq 1 ] && exit 1; [ "$c" -ne 0 ] && echo "ewc3-docs: trailer check SKIPPED (exit $c); CI enforces it." >&2';
}

function installHook(repo, { script, node, strict = false }) {
	const file = hookFile(repo);
	if (!file) { return { code: 2, message: `did not run: ${repo} is not a git work tree` }; }
	const text = hookText(script, node, { strict });
	if (fs.existsSync(file)) {
		const current = fs.readFileSync(file, 'utf8');
		if (!isOurs(current)) {
			return { code: 2, message: `did not run: ${file} ${notOursWhy(current)}, and it is not replaced. Add this line to it instead:\n  ${snippet(strict)}` };
		}
		if (current === text) { return { code: 0, message: `already installed: ${file}` }; }
		fs.writeFileSync(file, text);
		fs.chmodSync(file, 0o755);
		return { code: 0, message: `updated: ${file}` };
	}
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, text);
	fs.chmodSync(file, 0o755);
	return { code: 0, message: `installed: ${file}` };
}

/** Remove the hook only if this tool wrote it. */
function uninstallHook(repo) {
	const file = hookFile(repo);
	if (!file) { return { code: 2, message: `did not run: ${repo} is not a git work tree` }; }
	if (!fs.existsSync(file)) { return { code: 0, message: `not installed: ${file}` }; }
	const current = fs.readFileSync(file, 'utf8');
	if (!isOurs(current)) { return { code: 2, message: `did not run: ${file} ${notOursWhy(current)}; it is left alone` }; }
	fs.unlinkSync(file);
	return { code: 0, message: `removed: ${file}` };
}

/** Why a hook is not this tool's to replace or remove. */
function notOursWhy(text) {
	return text.includes(MARK) ? 'was written by this tool and EDITED since' : 'is a commit-msg hook this tool did not write';
}

module.exports = { hookFile, hookText, installHook, uninstallHook, isOurs, MARK };
