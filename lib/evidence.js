'use strict';
// When was an id minted, and when was a line of evidence recorded? DOCS-075.
//
// Evidence is gathered by id TEXT. That is right until a number is used before it is minted: a downstream register
// used two numbers unminted for some work, then minted them for unrelated work, and migration filed the earlier
// STATUS line under the new slice as its evidence. No gate sees it - the id is valid and the line really mentions it.
//
// So both sides are dated from git, and a line recorded before its id was minted is SET APART - never dropped. Git
// plumbing only; when history cannot answer (not a repository, a shallow clone) the caller says the dates were not
// checked, rather than guessing.

const { execFileSync } = require('child_process');
const { normalizeId } = require('./slices.js');

function run(repo, args) {
	try {
		return { ok: true, out: execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }) };
	} catch {
		return { ok: false, out: '' };
	}
}

/** Why git history cannot date anything here, or null when it can. */
function historyUnavailable(repo) {
	const inside = run(repo, ['rev-parse', '--is-inside-work-tree']);
	if (!inside.ok || inside.out.trim() !== 'true') { return 'not a git repository'; }
	if (run(repo, ['rev-parse', '--is-shallow-repository']).out.trim() === 'true') { return 'a shallow clone - its first commits are missing'; }
	if (!run(repo, ['rev-parse', '--verify', '-q', 'HEAD']).ok) { return 'no commits yet'; }
	return null;
}

/**
 * normalized id -> 'YYYY-MM-DD', the author date of the first commit that ADDED a table row whose first cell is that id,
 * anywhere under docs/project/ except slices/. A row, not a mention: prose naming a number mints nothing. Rows moved
 * between roadmaps still count, because the first appearance anywhere is the one that matters.
 */
function mintDates(repo) {
	const why = historyUnavailable(repo);
	if (why) { return { ok: false, reason: why, dates: new Map() }; }
	const log = run(repo, ['-c', 'core.quotepath=off', 'log', '--reverse', '--no-color', '--no-ext-diff', '--no-renames',
		'--format=%x1e%as', '-p', '--unified=0', '--', 'docs/project', ':(exclude)docs/project/slices']);
	if (!log.ok) { return { ok: false, reason: 'git log failed', dates: new Map() }; }
	const dates = new Map();
	for (const commit of log.out.split('\x1e')) {
		const date = commit.slice(0, 10);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { continue; }
		for (const line of commit.split('\n')) {
			if (line.startsWith('+++') || !/^\+\s*\|/.test(line)) { continue; }
			// The first cell, as the id grammar reads it (suffixes included), with a link or code span unwrapped.
			const cell = (line.slice(1).split('|')[1] || '').trim().replace(/^\[([^\]]*)\].*$/, '$1').replace(/`/g, '');
			const id = normalizeId(cell);
			if (id && !dates.has(id)) { dates.set(id, date); }
		}
	}
	return { ok: true, reason: null, dates };
}

/**
 * One date per line of a file (0-based): the first ISO date written IN the line, else the author date `git blame` gives
 * it, else null. The in-line date wins because a status line usually says when the work happened; blame only says when
 * the line was written down.
 */
function lineDates(repo, relFile, text) {
	const lines = String(text || '').split('\n');
	const blamed = [];
	const blame = run(repo, ['blame', '--line-porcelain', '--', relFile]);
	if (blame.ok) {
		let at = null, time = null;
		for (const l of blame.out.split('\n')) {
			const head = /^[0-9a-f]{40} \d+ (\d+)/.exec(l);
			if (head) { at = Number(head[1]) - 1; time = null; continue; }
			if (l.startsWith('author-time ')) { time = Number(l.slice(12)); continue; }
			const tz = /^author-tz ([+-])(\d{2})(\d{2})$/.exec(l);
			if (tz && at !== null && time !== null) {
				const offset = (tz[1] === '-' ? -1 : 1) * (Number(tz[2]) * 3600 + Number(tz[3]) * 60);
				blamed[at] = new Date((time + offset) * 1000).toISOString().slice(0, 10);
			}
		}
	}
	return lines.map((l, i) => {
		const m = /\b(\d{4}-\d{2}-\d{2})\b/.exec(l);
		return m ? m[1] : (blamed[i] || null);
	});
}

/**
 * The dating a migration uses: `{ ok, reason, mint: Map, status: [date|null], pullup: [date|null] }`.
 * Files are repository-relative; a missing file dates nothing.
 */
function evidenceDating(repo, { statusFile, statusText, pullupFile, pullupText }) {
	const minted = mintDates(repo);
	if (!minted.ok) { return { ok: false, reason: minted.reason, mint: minted.dates, status: [], pullup: [] }; }
	return {
		ok: true, reason: null, mint: minted.dates,
		status: statusText ? lineDates(repo, statusFile, statusText) : [],
		pullup: pullupText ? lineDates(repo, pullupFile, pullupText) : [],
	};
}

module.exports = { historyUnavailable, mintDates, lineDates, evidenceDating };
