'use strict';
// fold: git trailers become slice-document state. DOCS-036, DOCS-038.
//
// The slice document is the object. The commit that did the work records what happened -
//
//     Slice: VS-123
//     State: coded
//
// - and fold writes the newest such event into that document's frontmatter, from which `index` renders the
// row. Nobody edits the table and nobody maintains a status field: the event rides the commit, so it cannot
// drift from the work. See docs/design/one-thing-to-edit.md.
//
// CONTRACT (agreed downstream, 2026-09-17):
//   - trailers in the LAST paragraph; each `State:` belongs to the nearest `Slice:` above it, so one commit
//     can advance several slices; a `Slice:` with no `State:` is a timeline event with no state change;
//   - ids match padding-insensitively; the State word is the legend's bare word, case-insensitive, and is
//     WRITTEN in the register's own spelling (`💨 smoked`), read from its `State Legend` bullets;
//   - newest wins in `git log --topo-order` on the checked-out branch, and the sha that won is recorded;
//   - `state_source: human` is never overwritten - a person's decision is current by definition;
//   - fold writes slice frontmatter ONLY. It never writes STATUS.yaml or anything cross-repository: current
//     state is read from frontmatter, and roll-ups belong to the estate's own tooling.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const frontmatter = require('./frontmatter.js');
const { rowCells, headerMap, indexHeadings, normalizeId } = require('./slices.js');
const { indexRows } = require('./deliveryindex.js');

/**
 * Pair a commit's trailer lines. Each `State:` belongs to the nearest `Slice:` above it.
 * Returns `{ pairs: [{ slice, state|null }], errors: [message] }`.
 */
function parseTrailers(lines) {
	const pairs = [];
	const errors = [];
	for (const raw of lines) {
		const m = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/.exec(String(raw).trim());
		if (!m) { continue; }
		const key = m[1].toLowerCase();
		const value = m[2].trim();
		if (key === 'slice') {
			pairs.push({ slice: value, state: null });
		} else if (key === 'state') {
			const last = pairs[pairs.length - 1];
			if (!last) { errors.push(`State: with no Slice: above it (State: ${value})`); } else if (last.state !== null) {
				errors.push(`a second State: for Slice: ${last.slice} (State: ${value})`);
			} else { last.state = value; }
		}
	}
	return { pairs, errors };
}

/** The first word of a state value, lowercased: `💨 smoked` -> `smoked`, `⏸️ deferred` -> `deferred`. */
function wordOf(value) {
	const m = /[A-Za-z][A-Za-z0-9-]*/.exec(String(value || ''));
	return m ? m[0].toLowerCase() : null;
}

/**
 * A register's legend, word -> spelling, from its `State Legend` bullets (any heading level): `- <glyph> \`<word>\` — ...`.
 * A bullet whose text starts with `_` is a note (a reserved word), not a state. Empty when there is no legend, or
 * when it cannot be fully read - `readLegend` says which.
 */
function legendOf(text) {
	return readLegend(text).legend;
}

/**
 * The State Legend, or the line that makes it unreadable: `{ found, legend, unreadable: null | { line, text } }`.
 *
 * REFUSE, DON'T PARSE HARDER (DOCS-074). A legend the reader could only partly read used to SHRINK silently: one
 * bullet listing several states yielded its first word, a `###` legend was not found at all, and every dropped word
 * was then refused as "not in the legend" - exit 1, reading as the trailer's fault. The canonical shape is one
 * top-level bullet per state, `- <glyph> \`word\` — meaning`; anything that visibly lists states some other way is
 * named, not guessed at. A meaning may mention another state in backticks, and a nested bullet may explain one.
 */
function readLegend(text) {
	const lines = String(text).split('\r\n').join('\n').split('\n');
	const legend = new Map();
	const start = lines.findIndex((l) => /^#{2,6}\s+State Legend\b/i.test(l.trim()));
	if (start === -1) { return { found: false, legend, unreadable: null }; }
	const level = /^#+/.exec(lines[start].trim())[0].length;
	let end = lines.length;
	for (let i = start + 1; i < lines.length; i++) {
		const h = /^(#{1,6})\s/.exec(lines[i]);
		if (h && h[1].length <= level) { end = i; break; }
	}
	const bad = (i) => ({ found: true, legend, unreadable: { line: i + 1, text: lines[i] } });
	let fence = false;
	for (let i = start + 1; i < end; i++) {
		const line = lines[i];
		if (/^\s{0,3}(`{3,}|~{3,})/.test(line)) { fence = !fence; continue; }
		if (fence) { continue; }
		const bullet = /^ ?[-*+]\s+(.*)$/.exec(line);
		if (!bullet) {
			// A nested bullet or prose explains; a `·`-separated list of states is a legend written another way.
			if (!/^\s{2,}[-*+]\s/.test(line) && line.includes('·')) { return bad(i); }
			continue;
		}
		const content = bullet[1].trim();
		if (content.startsWith('_')) { continue; }
		// The part before the meaning names the state: exactly one backticked word, and no list of them.
		const head = content.split(/\s[—–-]\s/)[0];
		const words = [...head.matchAll(/`([A-Za-z][A-Za-z0-9-]*)`/g)];
		if (words.length !== 1 || head.includes('·')) { return bad(i); }
		const glyph = head.slice(0, words[0].index).trim();
		const word = words[0][1].toLowerCase();
		if (!legend.has(word)) { legend.set(word, glyph ? `${glyph} ${word}` : word); }
	}
	if (!legend.size) { return bad(start); }
	return { found: true, legend, unreadable: null };
}

/** word -> every spelling a register already uses for it, from its rows and its documents. For no-legend registers. */
function spellingsOf(roadmapTexts, docs) {
	const out = new Map();
	const add = (value) => {
		const v = String(value || '').trim();
		const w = wordOf(v);
		if (!v || !w) { return; }
		if (!out.has(w)) { out.set(w, new Set()); }
		out.get(w).add(v);
	};
	for (const text of roadmapTexts) {
		const at = headerMap(indexHeadings(text.split('\r\n').join('\n').split('\n'))).state;
		if (at === undefined) { continue; }
		for (const row of indexRows(text)) { add((rowCells(row.raw)[at] || '').trim()); }
	}
	for (const d of docs.values()) { add(d.data.state); }
	return out;
}

/** `{ value }` for a trailer's State word, or `{ error }`. */
function resolveState(word, legend, spellings) {
	const w = String(word).trim().toLowerCase();
	if (legend.size) {
		return legend.has(w) ? { value: legend.get(w) } : { error: `State: ${word} is not in the legend (${[...legend.keys()].join(', ')})` };
	}
	const found = spellings.get(w);
	if (!found || !found.size) { return { error: `State: ${word} is not in the legend - no row or document uses it, and the register has no State Legend` }; }
	if (found.size > 1) { return { error: `State: ${word} is ambiguous - this register spells it ${[...found].map((s) => JSON.stringify(s)).join(' and ')}` }; }
	return { value: [...found][0] };
}

/** Every commit on HEAD, newest first by topology, with its trailer lines. */
function gitEvents(repo) {
	const out = execFileSync('git', ['log', '--topo-order', '--format=%H%x1f%(trailers:only=true,unfold=true)%x1e'],
		{ cwd: repo, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
	return out.split('\x1e').map((s) => s.replace(/^\s+/, '')).filter(Boolean).map((rec) => {
		const [sha, block = ''] = rec.split('\x1f');
		return { sha: sha.trim(), lines: block.split('\n').map((l) => l.trim()).filter(Boolean) };
	});
}

/** Markdown files under `dir`, recursively; [] when absent. */
function markdownUnder(dir) {
	if (!fs.existsSync(dir)) { return []; }
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) { return markdownUnder(p); }
		return /\.md$/i.test(e.name) ? [p] : [];
	});
}

/**
 * Decide a fold. Writes nothing. Returns:
 *   changes     slices whose frontmatter STATE differs from their newest trailer - what `--check` fails on
 *   provenance  slices whose state already matches, but whose `state_sha`/`state_source` would be recorded
 *   conflicts   `state_source: human` slices a newer trailer disagrees with - named, never applied
 *   issues      malformed trailers: `{ sha, message, inScope }`, in scope when newer than `since`
 *
 * Or ONLY `{ unreadable: { file, line, text } }` when a State Legend exists but cannot be fully read (DOCS-074).
 *
 * The CHECK compares the state value only. A commit cannot contain its own sha, so a check that also required
 * `state_sha` would fail every trailer commit until a second commit folded it; comparing state lets a commit
 * that edits frontmatter and carries the matching trailer pass on its own.
 */
function planFold({ repo, sliceDir, roadmaps, sinceShas = null }) {
	const docs = new Map();
	for (const file of markdownUnder(sliceDir)) {
		const text = fs.readFileSync(file, 'utf8');
		let parsed;
		try { parsed = frontmatter.read(text); } catch { continue; }
		const id = parsed.had && normalizeId(parsed.data.id);
		if (id && !docs.has(id)) { docs.set(id, { file, text, data: parsed.data }); }
	}
	const archived = new Set();
	for (const file of markdownUnder(path.join(repo, 'docs', '_ARCHIVE'))) {
		try {
			const d = frontmatter.read(fs.readFileSync(file, 'utf8'));
			const id = d.had && normalizeId(d.data.id);
			if (id) { archived.add(id); }
		} catch { /* an unreadable archived document names nothing */ }
	}

	const texts = roadmaps.map((f) => fs.readFileSync(f, 'utf8'));
	// Two State Legends that spell one word differently make that word ambiguous. Keeping the first read let
	// glob order pick a spelling that may not belong to the slice's register (Codex, PR #15).
	const legend = new Map();
	const conflicting = new Map();
	for (const [n, t] of texts.entries()) {
		const read = readLegend(t);
		if (read.unreadable) { return { unreadable: { file: roadmaps[n], ...read.unreadable } }; }
		for (const [w, s] of read.legend) {
			if (!legend.has(w)) { legend.set(w, s); } else if (legend.get(w) !== s) {
				if (!conflicting.has(w)) { conflicting.set(w, new Set([legend.get(w)])); }
				conflicting.get(w).add(s);
			}
		}
	}
	const spellings = spellingsOf(texts, docs);

	const issues = [];
	const newest = new Map();
	for (const { sha, lines } of gitEvents(repo)) {
		const inScope = sinceShas ? sinceShas.has(sha) : false;
		const short = sha.slice(0, 12);
		const { pairs, errors } = parseTrailers(lines);
		errors.forEach((message) => issues.push({ sha: short, message, inScope }));
		for (const p of pairs) {
			const id = normalizeId(p.slice);
			if (!id || (!docs.has(id) && !archived.has(id))) {
				issues.push({ sha: short, message: `Slice: ${p.slice} names no slice document`, inScope });
				continue;
			}
			if (p.state === null) { continue; }
			const w = String(p.state).trim().toLowerCase();
			const resolved = conflicting.has(w)
				? { error: `State: ${p.state} is ambiguous - two State Legends spell it ${[...conflicting.get(w)].map((s) => JSON.stringify(s)).join(' and ')}` }
				: resolveState(p.state, legend, spellings);
			if (resolved.error) { issues.push({ sha: short, message: `${resolved.error} (Slice: ${p.slice})`, inScope }); continue; }
			if (!newest.has(id)) { newest.set(id, { sha: short, value: resolved.value }); }
		}
	}

	const changes = [];
	const provenance = [];
	const conflicts = [];
	for (const [id, ev] of newest) {
		const doc = docs.get(id);
		if (!doc) { continue; }
		const current = doc.data.state === undefined || doc.data.state === null ? '' : String(doc.data.state);
		if (doc.data.state_source === 'human') {
			if (current !== ev.value) { conflicts.push({ id, written: String(doc.data.id), file: doc.file, human: current, trailer: ev.value, sha: ev.sha }); }
			continue;
		}
		const entry = { id, written: String(doc.data.id), file: doc.file, text: doc.text, data: doc.data, from: current, to: ev.value, sha: ev.sha };
		if (current !== ev.value) { changes.push(entry); } else if (doc.data.state_sha !== ev.sha || doc.data.state_source !== 'trailer') { provenance.push(entry); }
	}
	return { changes, provenance, conflicts, issues, legendSource: legend.size ? 'State Legend' : 'spellings the register already uses' };
}

/** Apply one change or provenance entry: patch the frontmatter, keeping comments, order and the body. */
function applyFold(entry) {
	const data = { ...entry.data, state: entry.to, state_sha: entry.sha, state_source: 'trailer' };
	fs.writeFileSync(entry.file, frontmatter.write(entry.text, data));
}

module.exports = { parseTrailers, legendOf, readLegend, wordOf, resolveState, planFold, applyFold };
