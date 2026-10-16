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
//     can advance several slices; a `Slice:` with no `State:` is a timeline event with no state change - but
//     a state-less `Slice:` directly above a paired one is REFUSED, because one `State:` under several `Slice:`
//     lines reads as "all of them" and moves only the last (DOCS-089);
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
const { withoutFences, readSeriesText } = require('./series.js');

/**
 * A `Slice:` value resolved against THIS register. DOCS-040.
 *
 * `<registry>:<ID>` names a slice in a particular register. A qualified id never DECLARES anything - every declaring
 * pattern needs `-` straight after the prefix, where a qualifier puts `:` - and this is the half that RESOLVES one:
 *
 *   - bare, or qualified with this register's own name  -> `{ kind: 'local', id }`, checked like any id here;
 *   - qualified with another register's name            -> `{ kind: 'foreign', registry, id }`, reported and never
 *     refused or applied: it is not this register's slice, and its state word belongs to a legend this one cannot see.
 *
 * Registry names compare without case, as repository names do on GitHub. A register that cannot name itself
 * (`ownName` null) cannot claim any qualified id, so every one reads as foreign - and the caller says how to fix that.
 */
const QUALIFIED = /^([A-Za-z0-9][A-Za-z0-9._-]*):(.+)$/;
function sliceRef(value, ownName) {
	const written = String(value).trim();
	const q = QUALIFIED.exec(written);
	if (!q) { return { kind: 'local', id: normalizeId(written), written }; }
	const id = normalizeId(q[2]);
	// A qualifier around something that is not an id refers to nothing. Classified as foreign it was waved through -
	// `other:not-an-id`, and the typo `VS:1` - so it goes down the local path, where an unresolvable id is refused
	// exactly as a bare one is (Codex and Copilot, PR #39).
	if (!id) { return { kind: 'local', id: null, written }; }
	if (ownName && q[1].toLowerCase() === String(ownName).toLowerCase()) { return { kind: 'local', id, written }; }
	return { kind: 'foreign', registry: q[1], id, written };
}

/**
 * The name this register goes by, which is what an own qualifier must say. DOCS-040.
 *
 * Config `registry` wins: a register may state its name outright. Otherwise it is the ONE Owner its owned rows agree on
 * - which is the repository's own name wherever a repository plans for itself, and the hub's where a hub plans for
 * several. Reference-only rows are skipped: their Owner names ANOTHER register. Owned rows that disagree, or a register
 * with no Owner column, name nothing, and that is reported rather than guessed - a wrong name would claim another
 * register's slices or disown this one's.
 */
function registryName(texts, configured) {
	if (configured) { return String(configured); }
	// Keyed without case, as registry names compare, keeping the first spelling: `hub` and `HUB` are one name, and
	// counting them as two left the register nameless, so its own qualified trailers were skipped as foreign while
	// fold exited 0. EVERY owned row must give an Owner - a blank one has not agreed, and ignoring it claimed a name
	// the register had not fully declared (Codex and Copilot, PR #39).
	const names = new Map();
	let silent = false;
	for (const text of texts) {
		const read = readSeriesText(text);
		for (const prefix of read.declared) {
			const scope = read.scopes.get(prefix);
			if (scope && scope.reference) { continue; }
			const owner = read.owners.get(prefix);
			if (!owner) { silent = true; continue; }
			if (!names.has(owner.toLowerCase())) { names.set(owner.toLowerCase(), owner); }
		}
	}
	return !silent && names.size === 1 ? [...names.values()][0] : null;
}

/**
 * A problem with a STABLE CODE beside its words (DOCS-090). Callers that branch - a CI wrapper reading `--format json` -
 * branch on `code`, which is part of the published schema; `message` is for people and may be reworded.
 */
function problem(code, message) {
	return { code, message };
}

/**
 * Pair a commit's trailer lines. Each `State:` belongs to the nearest `Slice:` above it.
 * Returns `{ pairs: [{ slice, state|null }], errors: [{ code, message }], override: reason|null }` - `State-Override: <reason>`
 * lets this commit's transitions move a slice backwards in a declared `progression` (DOCS-084).
 */
function parseTrailers(lines) {
	const pairs = [];
	const errors = [];
	let override = null;
	// Pairs before this index are settled: a later State: cannot be read as theirs.
	let settled = 0;
	for (const raw of lines) {
		const m = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/.exec(String(raw).trim());
		if (!m) { continue; }
		const key = m[1].toLowerCase();
		const value = m[2].trim();
		if (key === 'slice') {
			pairs.push({ slice: value, state: null });
		} else if (key === 'state-override') {
			if (!value) { errors.push(problem('override-without-reason', 'State-Override: needs a reason - it is the record of why a slice moved backwards')); } else { override = value; }
		} else if (key === 'state') {
			const last = pairs[pairs.length - 1];
			if (!last) { errors.push(problem('state-without-slice', `State: with no Slice: above it (State: ${value})`)); } else if (last.state !== null) {
				errors.push(problem('second-state', `a second State: for Slice: ${last.slice} (State: ${value})`));
			} else {
				last.state = value;
				// ONE State: UNDER SEVERAL Slice: LINES READS AS "ALL OF THEM", AND MEANS "ONLY THE LAST" (DOCS-089).
				// The state-less Slices directly above are timeline events, by the pairing rule - but nothing in the
				// message says so, and a commit meaning "all of these are coded" moved only the last. Refused where the shape is
				// ambiguous only: a timeline Slice written BELOW a paired one, or a commit with no State: at all, is not.
				const above = pairs.slice(settled, -1).map((p) => p.slice);
				if (above.length) {
					errors.push(problem('ambiguous-state', `State: ${value} applies only to Slice: ${last.slice} - ${above.map((s) => `Slice: ${s}`).join(', ')} above it ${above.length > 1 ? 'get' : 'gets'} no state change. Give each Slice: its own State:, or move a timeline-only Slice: below the State:`));
				}
				settled = pairs.length;
			}
		}
	}
	return { pairs, errors, override };
}

/**
 * Lines of a message that are written as this toolkit's trailers but are NOT in the trailer block git parsed - so
 * nothing reads them (DOCS-088). Git keeps only the LAST paragraph's trailers: a blank line between `Slice:` and a
 * `Co-Authored-By:` below it leaves the `Slice:` in the body, and a check that reads trailers sees none and says ok.
 *
 * A candidate sits in a paragraph that is ENTIRELY `Key: value` lines - a trailer block that is not the last one - and
 * starts in column 0. A wrapped prose line that happens to begin `State: ...` is in a prose paragraph and is not one;
 * an indented line is a continuation, a quote or a diff. The subject paragraph never holds trailers. Each parsed trailer
 * line cancels one candidate with the same key and value.
 */
function strandedTrailers(message, trailerLines) {
	const norm = (l) => l.replace(/^([^:]+?)\s*:\s*/, (m, k) => `${k.toLowerCase()}: `).replace(/\s+/g, ' ').trim();
	const parsed = new Map();
	for (const l of trailerLines) { parsed.set(norm(l), (parsed.get(norm(l)) || 0) + 1); }
	const paragraphs = String(message).split('\r\n').join('\n').split(/\n[ \t]*\n/).slice(1)
		.map((para) => para.split('\n').filter((l) => l.trim()));
	const stranded = [];
	// Last paragraph first: it is the one git parsed, so its lines are the ones the parsed trailers cancel.
	for (const para of paragraphs.reverse()) {
		// An indented line continues the trailer above it; leading a paragraph, it is a quote or a diff, and disqualifies it.
		if (!para.length || !para.every((l, i) => /^[A-Za-z][A-Za-z0-9-]*\s*:/.test(l) || (i > 0 && /^\s/.test(l)))) { continue; }
		const found = [];
		for (const raw of para) {
			if (!/^(slice|state|no-slice)\s*:/i.test(raw)) { continue; }
			const k = norm(raw);
			if (parsed.get(k)) { parsed.set(k, parsed.get(k) - 1); continue; }
			found.push(raw.trim());
		}
		stranded.unshift(...found);
	}
	return stranded;
}

/** Why a stranded trailer is not read, in one line. */
function strandedMessage(line) {
	return `${line} is not in the trailer block - git reads trailers only from the message's LAST paragraph, so nothing checks this line. Move it into the final trailer block, with no blank line between them`;
}

/** "names no slice document", or - for `Slice: A, B` - the one-per-line rule it actually broke. */
function unnamedProblem(value) {
	return /[,;]|\S\s+\S/.test(value)
		? problem('multi-slice-trailer', `Slice: ${value} names more than one slice in one trailer - write one Slice: per line, each with its own State:`)
		: problem('unnamed-slice', `Slice: ${value} names no slice document`);
}

/** A stranded trailer line as a problem. */
function strandedProblem(line) {
	return problem('stranded-trailer', strandedMessage(line));
}

/** A state word that did not resolve, as a problem naming the trailer it came from. */
function stateProblem(resolved, slice) {
	return problem(resolved.code, `${resolved.error} (Slice: ${slice})`);
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
/** `_` and `*` used as emphasis delimiters around a glyph, removed - but never a `*` that IS one (`*️⃣`). */
function stripEmphasis(s) {
	return String(s).trim().replace(/^[_*]+(?![️⃣])/, '').replace(/[_*]+$/, '').trim();
}

function readLegend(text) {
	const source = String(text).split('\r\n').join('\n');
	// What RENDERS: fences (by run and character) and HTML comments blanked, line count kept. A fenced example of a
	// legend is documentation - it defined states, and a nested fence exposed example bullets (Codex, PR #20).
	const lines = withoutFences(source).split('\n');
	const original = source.split('\n');
	const legend = new Map();
	const start = lines.findIndex((l) => /^#{2,6}\s+State Legend\b/i.test(l.trim()));
	if (start === -1) { return { found: false, legend, unreadable: null }; }
	const level = /^#+/.exec(lines[start].trim())[0].length;
	let end = lines.length;
	for (let i = start + 1; i < lines.length; i++) {
		const h = /^(#{1,6})\s/.exec(lines[i]);
		if (h && h[1].length <= level) { end = i; break; }
	}
	const bad = (i, why) => ({ found: true, legend, unreadable: { line: i + 1, text: original[i], why } });
	// A legend written another way: two or more `·`-separated items, each an optional glyph and ONE word. Prose that
	// happens to contain a middle dot (`Lifecycle · delivery states only`) lists no states (Codex, PR #20).
	const stateList = (s) => {
		const items = s.split('·');
		return items.length >= 2 && items.every((it) => /^\s*(?:\S+\s+)?`?[A-Za-z][A-Za-z0-9-]*`?\s*[.…]*\s*$/.test(it) || /^\s*…\s*$/.test(it));
	};
	for (let i = start + 1; i < end; i++) {
		const line = lines[i];
		const bullet = /^ ?[-*+]\s+(.*)$/.exec(line);
		if (!bullet) {
			// A nested bullet or prose explains; a list of states on one line is a legend written another way.
			if (!/^\s{2,}[-*+]\s/.test(line) && stateList(line)) { return bad(i); }
			continue;
		}
		const content = bullet[1].trim();
		if (content.startsWith('_')) {
			// AN UNDERSCORE BULLET IS A NOTE ONLY IF IT HAS NO GLYPH (DOCS-080). Skipping every `_` bullet is right for
			// a reserved-state note - "`tested` … is **reserved**" means the word is not a state - but emphasis is
			// indistinguishable from that convention, so italicising a REAL state deleted it from the legend, silently,
			// exit 0. Every trailer using the word was then refused, a red pointing at the COMMIT while the fault is in
			// the legend. A glyph plus exactly one backticked word is a state somebody emphasised: refuse it by name.
			// Stripping the emphasis instead would guess at intent, and write underscores into every row's spelling.
			const inner = content.replace(/^_+/, '');
			const noteHead = inner.split(/\s[—–-]\s/)[0];
			const noteWords = [...noteHead.matchAll(/`([A-Za-z][A-Za-z0-9-]*)`/g)];
			if (noteWords.length === 1 && stripEmphasis(noteHead.slice(0, noteWords[0].index))) {
				return bad(i, `\`${noteWords[0][1]}\` is a state bullet in italics, so it was being dropped from the legend`
					+ ' - a note carries no glyph; remove the emphasis to declare it, or remove the glyph to make it a note');
			}
			continue;
		}
		// The part before the meaning names the state: exactly one backticked word.
		const head = content.split(/\s[—–-]\s/)[0];
		const words = [...head.matchAll(/`([A-Za-z][A-Za-z0-9-]*)`/g)];
		if (words.length !== 1) { return bad(i); }
		// Emphasis is not part of the glyph. `- <glyph> _`word` — meaning_` renders almost identically to the same
		// bullet unemphasised, and its spelling carried the underscore into frontmatter and every rendered row (DOCS-080).
		//
		// DELIMITERS ONLY, at the edges. A keycap glyph IS an asterisk - `*️⃣` is `*` + U+FE0F + U+20E3 - so stripping
		// every `*` ate the glyph and wrote the corrupted spelling everywhere: the same defect, one keystroke over
		// (Codex P1, PR #26). A run followed by a variation selector or a keycap mark is a glyph, not emphasis.
		const glyph = stripEmphasis(head.slice(0, words[0].index));
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
		return legend.has(w) ? { value: legend.get(w) } : { code: 'unknown-state', error: `State: ${word} is not in the legend (${[...legend.keys()].join(', ')})` };
	}
	const found = spellings.get(w);
	if (!found || !found.size) { return { code: 'unknown-state', error: `State: ${word} is not in the legend - no row or document uses it, and the register has no State Legend` }; }
	if (found.size > 1) { return { code: 'ambiguous-state-spelling', error: `State: ${word} is ambiguous - this register spells it ${[...found].map((s) => JSON.stringify(s)).join(' and ')}` }; }
	return { value: [...found][0] };
}

/** Every commit on HEAD, newest first by topology, with its trailer lines and its whole message. */
function gitEvents(repo) {
	const out = execFileSync('git', ['log', '--topo-order', '--format=%H%x1f%ct%x1f%(trailers:only=true,unfold=true)%x1f%B%x1e'],
		{ cwd: repo, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
	return out.split('\x1e').map((s) => s.replace(/^\s+/, '')).filter(Boolean).map((rec) => {
		const [sha, ct = '0', block = '', body = ''] = rec.split('\x1f');
		return { sha: sha.trim(), date: Number(ct) * 1000, lines: block.split('\n').map((l) => l.trim()).filter(Boolean), body };
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

/** Markdown files directly in `dir`, not in its subfolders: how the slice directory itself is read. */
function directMarkdown(dir) {
	if (!fs.existsSync(dir)) { return []; }
	return fs.readdirSync(dir, { withFileTypes: true })
		.filter((e) => e.isFile() && /\.md$/i.test(e.name)).map((e) => path.join(dir, e.name));
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
function planFold({ repo, sliceDir, roadmaps, sinceShas = null, registry = null, imported = null, localName = null, progression = undefined, backfill = false }) {
	const reg = loadRegister({ repo, sliceDir, roadmaps, registry });
	if (reg.unreadable) { return { unreadable: reg.unreadable }; }
	const { docs, archived, legend } = reg;
	// ABSENT IS THE ONLY "NONE". `""`, `false` or `null` written as the value is a declaration that cannot be read, and a
	// truthiness test passed it off as no progression - backwards moves then wrote and exited 0 (Codex, PR #46).
	const order = progression === undefined ? null : progressionOf(progression, reg);
	if (order && order.error) { return { configError: order.error }; }

	const issues = [];
	const foreign = [];
	const newest = new Map();
	const events = gitEvents(repo);
	for (const { sha, date, lines, body } of events) {
		const inScope = sinceShas ? sinceShas.has(sha) : false;
		const short = sha.slice(0, 12);
		const { pairs, errors, override } = parseTrailers(lines);
		errors.forEach((e) => issues.push({ sha: short, ...e, inScope }));
		strandedTrailers(body, lines).forEach((l) => issues.push({ sha: short, ...strandedProblem(l), inScope }));
		for (const p of pairs) {
			// Another register's slice is not this register's to fold: reported, never an issue (DOCS-040).
			const ref = sliceRef(p.slice, reg.ownName);
			if (ref.kind === 'foreign') { foreign.push({ sha: short, written: ref.written }); continue; }
			const id = ref.id;
			if (!id || (!docs.has(id) && !archived.has(id))) {
				issues.push({ sha: short, ...unnamedProblem(p.slice), inScope });
				continue;
			}
			if (p.state === null) { continue; }
			const resolved = stateFor(p.state, reg);
			if (resolved.error) { issues.push({ sha: short, ...stateProblem(resolved, p.slice), inScope }); continue; }
			if (!newest.has(id)) { newest.set(id, { sha: short, value: resolved.value, repo: null, source: 'trailer', date, override, inScope }); }
		}
	}
	if (!imported) {
		if (order) { statesBefore(repo, docs, newest); }
		return { ...decide(docs, newest, issues, legend, order), foreign, ownName: reg.ownName };
	}
	const fromList = importCommits({ repo, reg, commits: imported, local: events, issues, foreign, backfill });
	// THE LIST ADDS TO LOCAL HISTORY, NEVER REPLACES IT. Local history is ordered by topology among its own commits;
	// across repositories there is no shared ancestry, so its newest competes with the list's newest by committer
	// date - a weaker order, stated in the dry run - tie-broken by repository name, then sha, so one input always
	// gives one answer.
	const here = localName || reg.ownName || path.basename(repo);
	for (const [id, ev] of fromList.newest) {
		const local = newest.get(id);
		if (!local || newerThan({ ...ev, name: ev.repo }, { ...local, name: here })) { newest.set(id, ev); }
	}
	if (order) { statesBefore(repo, docs, newest); }
	return { ...decide(docs, newest, issues, legend, order), foreign, ownName: reg.ownName, unowned: fromList.unowned, quiet: fromList.quiet, local: fromList.local };
}

/**
 * For each LOCAL winning trailer, the slice's state in its commit's PARENT (DOCS-084). A commit that edits the
 * frontmatter back AND carries the matching State: leaves the document equal to the trailer, so comparing against the
 * document alone saw no move at all (Codex P1, PR #46). An imported sha is not here; its document is the current one.
 */
function statesBefore(repo, docs, newest) {
	for (const [id, ev] of newest) {
		const doc = docs.get(id);
		if (ev.repo || !doc) { continue; }
		const rel = path.relative(repo, doc.file).split(path.sep).join('/');
		const shown = gitRun(repo, ['show', `${ev.sha}^:${rel}`]);
		if (!shown.ok) { continue; }
		try {
			const d = frontmatter.read(shown.out);
			if (d.had && d.data.state !== undefined && d.data.state !== null) { ev.before = String(d.data.state); }
		} catch { /* no readable frontmatter then: no prior state to compare */ }
	}
}

/** Date descending, then repository name, then sha: true when `a` wins over `b`. */
function newerThan(a, b) {
	if (a.date !== b.date) { return a.date > b.date; }
	if (a.name !== b.name) { return a.name < b.name; }
	return a.sha < b.sha;
}

/**
 * The trailers of a commit list (DOCS-084), each message read by git's own parser. A commit already in local history
 * is skipped - it was read there. Prefixes this register does not declare are counted as `unowned` and applied to
 * nothing; a FROZEN prefix is refused by name; everything else is checked as a local trailer is, and every issue is
 * in scope - the list is the caller's statement of what is new. Under `backfill` it is not: the list is a repository's
 * HISTORY, swept once, and its issues are warnings exactly as old local history's are - valid trailers still fold,
 * and nothing is dropped by a cutoff (DOCS-091). Returns the newest event per slice.
 */
function importCommits({ repo, reg, commits, local: localEvents, issues, foreign, backfill = false }) {
	const { docs, archived } = reg;
	const owned = (prefix) => (reg.declaredPrefixes.size
		? reg.declaredPrefixes.has(prefix)
		: [...docs.keys(), ...archived].some((k) => k.startsWith(`${prefix}-`)));
	const newest = new Map();
	const unowned = new Map();
	const quiet = [];
	let local = 0;
	const ordered = [...commits].sort((a, b) => (newerThan({ ...a, name: a.repo }, { ...b, name: b.repo }) ? -1 : 1));
	for (const c of ordered) {
		// THE SAME COMMIT, NOT THE SAME PREFIX. A short sha from another repository can share a prefix with a local
		// commit; skipping on the prefix alone dropped that commit's transition and said it was already read (Codex,
		// PR #43). It is local only when exactly one local commit matches AND carries the same message.
		const matches = localEvents.filter((e) => e.sha.startsWith(c.sha));
		if (matches.length === 1 && matches[0].body.trimEnd() === String(c.message).trimEnd()) { local += 1; continue; }
		const tag = `${c.repo}@${c.sha.slice(0, 12)}`;
		const issue = (found) => issues.push({ sha: tag, ...found, inScope: !backfill });
		const lines = committedTrailers(repo, c.message);
		if (lines === null) { issue(problem('unparseable-message', 'git interpret-trailers could not parse the message')); continue; }
		const { pairs, errors, override } = parseTrailers(lines);
		const stranded = strandedTrailers(c.message, lines);
		errors.forEach(issue);
		stranded.forEach((l) => issue(strandedProblem(l)));
		if (!pairs.length && !stranded.length) { quiet.push(tag); }
		for (const p of pairs) {
			const ref = sliceRef(p.slice, reg.ownName);
			if (ref.kind === 'foreign') { foreign.push({ sha: tag, written: ref.written }); continue; }
			const id = ref.id;
			if (!id) { issue(unnamedProblem(p.slice)); continue; }
			const prefix = /^([A-Z][A-Z0-9]*)-/.exec(id)[1];
			if (!owned(prefix)) {
				const u = unowned.get(prefix) || { count: 0, first: tag };
				u.count += 1;
				unowned.set(prefix, u);
				continue;
			}
			if (reg.frozenPrefixes.has(prefix)) {
				issue(problem('frozen-prefix', `Slice: ${p.slice} - ${prefix} is frozen in this register; a retired series accepts no new state`));
				continue;
			}
			if (!docs.has(id) && !archived.has(id)) { issue(unnamedProblem(p.slice)); continue; }
			if (p.state === null) { continue; }
			const resolved = stateFor(p.state, reg);
			if (resolved.error) { issue(stateProblem(resolved, p.slice)); continue; }
			if (!newest.has(id)) {
				newest.set(id, { sha: c.sha.slice(0, 12), value: resolved.value, repo: c.repo, source: 'trailer-remote', date: c.date, dateText: c.dateText, override });
			}
		}
	}
	return { newest, unowned, quiet, local };
}

/** One commit list line's committer date: ISO 8601 with a time and a zone, as `git log --format=%cI` writes it. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Read a commit list (DOCS-084): NDJSON, one `{ sha, repo, committer_date, message }` per line, `repo` defaulting to
 * `sourceRepo`. Returns `{ commits, errors }`; every bad line is named by number, because a partly read list applied
 * would be a partial truth - the caller refuses the whole list on any error.
 */
function readCommitList(text, sourceRepo = null) {
	const commits = [];
	const errors = [];
	const seen = new Map();
	String(text).split(/\r?\n/).forEach((line, i) => {
		if (!line.trim()) { return; }
		const at = `line ${i + 1}`;
		let c;
		try { c = JSON.parse(line); } catch (err) { errors.push(`${at}: not JSON (${err.message})`); return; }
		if (!c || typeof c !== 'object' || Array.isArray(c)) { errors.push(`${at}: not a JSON object`); return; }
		const sha = typeof c.sha === 'string' ? c.sha.trim().toLowerCase() : '';
		if (!/^[0-9a-f]{7,64}$/.test(sha)) { errors.push(`${at}: sha ${JSON.stringify(c.sha)} is not a commit id`); return; }
		const repo = c.repo === undefined || c.repo === null || c.repo === '' ? sourceRepo : c.repo;
		if (typeof repo !== 'string' || !repo.trim()) { errors.push(`${at}: no repo - the line names none and --source-repo was not given`); return; }
		const dateText = typeof c.committer_date === 'string' ? c.committer_date.trim() : '';
		const date = ISO_DATE.test(dateText) ? Date.parse(dateText) : NaN;
		if (Number.isNaN(date)) {
			errors.push(`${at}: committer_date ${JSON.stringify(c.committer_date)} is not an ISO 8601 date with a time and zone (git log --format=%cI)`);
			return;
		}
		if (typeof c.message !== 'string') { errors.push(`${at}: message is not a string`); return; }
		const key = `${repo.trim()}@${sha}`;
		if (seen.has(key)) {
			if (seen.get(key) !== c.message) { errors.push(`${at}: ${key} appears twice with different messages`); }
			return;
		}
		seen.set(key, c.message);
		commits.push({ sha, repo: repo.trim(), date, dateText, message: c.message, line: i + 1 });
	});
	return { commits, errors };
}

/**
 * What every trailer is checked against, read once: the slice documents by normalized id, archived ids, the State Legend
 * (with words two legends spell differently), and the spellings a no-legend register already uses. Or
 * `{ unreadable: { file, line, text } }` for a legend that cannot be fully read (DOCS-074). No history is read.
 */
function loadRegister({ repo, sliceDir, roadmaps, registry = null }) {
	const docs = new Map();
	// The files DIRECTLY in slices/, as `index` and the migration inventory read them. Recursing made a backup under
	// slices/_legacy/ - kept precisely because its frontmatter is not authoritative - declare a live slice (Copilot, PR #22).
	for (const file of directMarkdown(sliceDir)) {
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
	const series = texts.map((text) => readSeriesText(text));
	const declaredPrefixes = new Set(series.flatMap((s) => [...s.declared]));
	// A retired series is still declared and owned; it accepts no new state (DOCS-084).
	const frozenPrefixes = new Set(series.flatMap((s) => [...s.scopes].filter(([, v]) => v.frozen).map(([p]) => p)));
	return { docs, archived, legend, conflicting, spellings: spellingsOf(texts, docs), ownName: registryName(texts, registry), declaredPrefixes, frozenPrefixes, unreadable: null };
}

/** A trailer's State word in the register's spelling: `{ value }`, or `{ error }` naming why not. */
function stateFor(word, reg) {
	const w = String(word).trim().toLowerCase();
	if (reg.conflicting.has(w)) {
		return { code: 'ambiguous-state-spelling', error: `State: ${word} is ambiguous - two State Legends spell it ${[...reg.conflicting.get(w)].map((s) => JSON.stringify(s)).join(' and ')}` };
	}
	return resolveState(word, reg.legend, reg.spellings);
}

/**
 * A config `progression`, checked against the register: an array of distinct words this register's states resolve.
 * `[word, ...]` lowercased, or `{ error }` - a declared order that names a state nobody spells would refuse nothing
 * for that word, quietly (DOCS-084).
 */
function progressionOf(progression, reg) {
	if (!Array.isArray(progression) || !progression.length || !progression.every((w) => typeof w === 'string' && w.trim())) {
		return { error: `progression must be a non-empty array of state words, got ${JSON.stringify(progression)}` };
	}
	const words = progression.map((w) => w.trim().toLowerCase());
	const twice = words.find((w, i) => words.indexOf(w) !== i);
	if (twice) { return { error: `progression names ${twice} twice` }; }
	const unknown = words.find((w) => stateFor(w, reg).error);
	if (unknown) { return { error: `progression names ${unknown}, which is not a state this register spells (${stateFor(unknown, reg).error})` }; }
	return words;
}

/** True when `to` sits earlier than `from` in the progression; a word outside it is never backwards. */
function backwards(order, from, to) {
	const f = order.indexOf(wordOf(from));
	const t = order.indexOf(wordOf(to));
	return f > -1 && t > -1 && t < f;
}

/** The newest trailer per slice, against its frontmatter: changes, provenance and human conflicts. */
function decide(docs, newest, issues, legend, order = null) {
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
		const entry = { id, written: String(doc.data.id), file: doc.file, text: doc.text, data: doc.data, from: current, to: ev.value,
			sha: ev.sha, repo: ev.repo || null, source: ev.source || 'trailer', dateText: ev.dateText || (ev.date ? new Date(ev.date).toISOString() : null), override: null };
		// A DECLARED progression refuses a backwards move unless the winning commit says why (DOCS-084). Only words in
		// the list are ordered: `blocked` or `deferred` outside it are never "backwards".
		const pending = order && current !== ev.value && backwards(order, current, ev.value);
		// Already committed: the winning commit moved the document itself, so it equals the trailer now.
		const committed = order && !pending && ev.before !== undefined && ev.before !== ev.value && backwards(order, ev.before, ev.value);
		const back = pending || committed;
		if (back && !ev.override) {
			const sha = ev.repo ? `${ev.repo}@${ev.sha}` : ev.sha;
			issues.push(pending
				? { sha, inScope: true, code: 'backwards', message: `${doc.data.id}: ${wordOf(current)} -> ${wordOf(ev.value)} moves BACKWARDS in progression (${order.join(', ')}) - refused, not written; a commit that means it carries State-Override: <reason>` }
				: { sha, inScope: Boolean(ev.inScope), code: 'backwards-committed', message: `${doc.data.id}: ${wordOf(ev.before)} -> ${wordOf(ev.value)} was committed BACKWARDS in progression (${order.join(', ')}) with no State-Override:` });
			continue;
		}
		if (back) { entry.override = ev.override; }
		const recorded = doc.data.state_sha === ev.sha && doc.data.state_source === entry.source && (doc.data.state_repo || null) === entry.repo;
		if (current !== ev.value) { changes.push(entry); } else if (!recorded) { provenance.push(entry); }
	}
	return { changes, provenance, conflicts, issues, legendSource: legend.size ? 'State Legend' : 'spellings the register already uses' };
}

/** Apply one change or provenance entry: patch the frontmatter, keeping comments, order and the body. */
function applyFold(entry) {
	// An imported transition says so: `state_repo` names where `state_sha` lives, and `trailer-remote` that this
	// repository could not verify it (DOCS-084). A local one carries neither.
	const data = { ...entry.data, state: entry.to, state_sha: entry.sha, state_repo: entry.repo, state_source: entry.source || 'trailer' };
	if (!entry.repo) { delete data.state_repo; }
	fs.writeFileSync(entry.file, frontmatter.write(entry.text, data));
}

// ---------------------------------------------------------------------------
// DOCS-073. A commit message checked BEFORE the commit exists, by the same grammar fold reads history with - so a commit
// command and a commit-msg hook refuse a bad trailer instead of fold warning about it once history cannot change.

function gitRun(repo, args, input) {
	try {
		const out = execFileSync('git', args, { cwd: repo, encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] });
		return { ok: true, out };
	} catch {
		return { ok: false, out: '' };
	}
}

/**
 * The trailer lines of a message as git will store it. Comment lines (`core.commentChar`, default `#`) and everything
 * below a scissors line are cut, as git's cleanup does; then `git interpret-trailers --parse` picks the trailer block -
 * the same parser behind `%(trailers)`, which is how fold reads committed history. One grammar, not two.
 */
function messageTrailers(repo, raw) {
	return committedTrailers(repo, storedMessage(repo, raw));
}

/**
 * The trailer lines of a message ALREADY committed - no cleanup, because git did that when it stored it, and a stored
 * line starting `#` is text, not a comment. How a commit list's messages are read (DOCS-084).
 */
function committedTrailers(repo, message) {
	const parsed = gitRun(repo, ['interpret-trailers', '--parse'], `${String(message).trimEnd()}\n`);
	if (!parsed.ok) { return null; }
	return parsed.out.split('\n').map((l) => l.trim()).filter(Boolean);
}

/** A message as git will store it: comment lines and everything below a scissors line cut. */
function storedMessage(repo, raw) {
	const configured = gitRun(repo, ['config', '--get', 'core.commentChar']).out.trim();
	const c = configured && configured !== 'auto' ? configured : '#';
	const lines = String(raw).split('\r\n').join('\n').split('\n');
	const cut = lines.findIndex((l) => l === `${c} ------------------------ >8 ------------------------`);
	return (cut === -1 ? lines : lines.slice(0, cut)).filter((l) => !l.startsWith(c)).join('\n');
}

/** Keys `fold --write` owns; a document whose diff touches only these may be fold recording history. */
const FOLD_KEYS = new Set(['state', 'state_sha', 'state_repo', 'state_source']);

/**
 * Check a commit message's trailers, and with `staged` the slice documents in the index.
 *
 * Returns `{ unreadable }` for a legend that cannot be read, or `{ problems, notes, pairs, stagedDocs }`: `problems`
 * refuse (each names its trailer or file), `notes` explain what was skipped. See DOCS-073 for the rules.
 */
function checkMessage({ repo, registerRoot = repo, sliceDir, roadmaps, message, staged = false, registry = null, progression = undefined }) {
	const reg = loadRegister({ repo: registerRoot, sliceDir, roadmaps, registry });
	if (reg.unreadable) { return { unreadable: reg.unreadable }; }
	const problems = [];
	const notes = [];

	const order = progression === undefined ? null : progressionOf(progression, reg);
	if (order && order.error) { return { failed: order.error }; }

	const lines = messageTrailers(repo, message);
	if (lines === null) { return { failed: 'git interpret-trailers could not parse the message' }; }
	const { pairs, errors, override } = parseTrailers(lines);
	errors.forEach((e) => problems.push(e));
	strandedTrailers(storedMessage(repo, message), lines).forEach((l) => problems.push(strandedProblem(l)));
	const named = new Map();
	let unnamed = false;
	for (const p of pairs) {
		// Another register's slice - including its state word, which belongs to a legend this one cannot see - is
		// reported and never refused. A commit may name slices in two registers (DOCS-040).
		const ref = sliceRef(p.slice, reg.ownName);
		if (ref.kind === 'foreign') {
			notes.push(`Slice: ${ref.written} names a slice in another register (${ref.registry}) - not checked here`);
			if (!reg.ownName) { unnamed = true; }
			continue;
		}
		const id = ref.id;
		const known = id && (reg.docs.has(id) || reg.archived.has(id));
		// Every problem at once: a bad id does not hide a bad state word beneath it.
		if (!known) {
			// Only where the register STATES what it owns, and nothing here uses the prefix either: a register with no
			// ownership table declares nothing, and without this guard every id in it read as foreign.
			const prefix = id && /^([A-Z][A-Z0-9]*)-/.exec(id);
			const usedHere = prefix && [...reg.docs.keys(), ...reg.archived].some((k) => k.startsWith(`${prefix[1]}-`));
			problems.push(prefix && reg.declaredPrefixes.size && !reg.declaredPrefixes.has(prefix[1]) && !usedHere
				? problem('unowned-prefix', `Slice: ${p.slice} - ${prefix[1]} is not a prefix this register owns. If it is another register's slice, qualify it as <registry>:${id}; otherwise check the prefix for a typo`)
				: unnamedProblem(p.slice));
		}
		if (id && !named.has(id)) { named.set(id, []); }
		if (p.state === null) { continue; }
		const resolved = stateFor(p.state, reg);
		if (resolved.error) { problems.push(stateProblem(resolved, p.slice)); continue; }
		if (known) { named.get(id).push(resolved.value); }
	}

	// No-Slice: <reason> - a commit either names its slices or says why it names none.
	const exemptions = lines.map((l) => /^No-Slice:\s*(.*)$/i.exec(l)).filter(Boolean);
	for (const e of exemptions) {
		if (!e[1].trim()) { problems.push(problem('no-slice-without-reason', 'No-Slice: needs a reason - say why this commit names no slice')); }
	}
	if (exemptions.length && pairs.length) {
		problems.push(problem('no-slice-with-slice', 'No-Slice: cannot stand with Slice: trailers - name every slice the commit touches, or none with a reason'));
	}

	let stagedDocs = 0;
	if (staged && gitRun(repo, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']).ok) {
		notes.push('merge in progress: --staged skipped - the merged commits carried their own trailers');
	} else if (staged) {
		// The COMMITTING repository's own slice documents: reading the register's tree passed a hub-side staged edit
		// off as this commit's own, and counted it as checked (DOCS-085).
		const rel = path.relative(repo, path.join(repo, 'docs', 'project', 'slices')).split(path.sep).join('/');
		const diff = gitRun(repo, ['-c', 'core.quotepath=off', 'diff', '--cached', '--name-status', '-M', '-z', '--no-ext-diff', '--', rel]);
		const fields = diff.out.split('\0');
		const hasHead = gitRun(repo, ['rev-parse', '-q', '--verify', 'HEAD']).ok;
		const blob = (spec) => { const r = gitRun(repo, ['show', spec]); return r.ok ? r.out : null; };
		const parse = (text) => { try { return text === null ? null : frontmatter.read(text); } catch { return null; } };
		for (let i = 0; i < fields.length && fields[i];) {
			const status = fields[i];
			const renamed = /^[RC]/.test(status);
			const before = fields[i + 1];
			const file = renamed ? fields[i + 2] : before;
			i += renamed ? 3 : 2;
			if (status.startsWith('D') || !/\.md$/i.test(file)) { continue; }
			const now = parse(blob(`:${file}`));
			const prior = hasHead && !status.startsWith('A') ? parse(blob(`HEAD:${before}`)) : null;
			const id = now && now.had && normalizeId(now.data.id);
			if (!id) {
				// A document that WAS a slice and no longer declares one is a broken document, not a non-document: it
				// used to be skipped as "not a slice document" and passed unchecked (Codex, PR #22).
				if (prior && prior.had && normalizeId(prior.data.id)) {
					problems.push({ ...problem('staged-no-id', `${file}: the staged document for ${prior.data.id} has no readable id: in its frontmatter`), file });
				}
				continue;
			}
			stagedDocs++;
			const nowState = now.data.state === undefined || now.data.state === null ? '' : String(now.data.state);
			const priorState = prior && prior.data.state !== undefined && prior.data.state !== null ? String(prior.data.state) : '';

			// FOLD RECORDING HISTORY: only fold-owned keys changed, and the commit its state_sha names says this state.
			if (prior && now.data.state_source === 'trailer' && now.data.state_sha && prior.body === now.body) {
				const others = (d) => JSON.stringify(Object.entries(d).filter(([k]) => !FOLD_KEYS.has(k)));
				if (others(prior.data) === others(now.data)) {
					const said = gitRun(repo, ['log', '-1', '--format=%(trailers:only=true,unfold=true)', String(now.data.state_sha)]);
					const agrees = said.ok && parseTrailers(said.out.split('\n').map((l) => l.trim()).filter(Boolean)).pairs
						.some((p) => { const r = sliceRef(p.slice, reg.ownName); return r.kind === 'local' && r.id === id && p.state !== null && stateFor(p.state, reg).value === nowState; });
					if (agrees) { continue; }
				}
			}

			if (!named.has(id) && !exemptions.length) {
				problems.push({ ...problem('staged-unnamed', `${file}: staged slice document ${now.data.id} is not named by a Slice: trailer (or add No-Slice: <reason>)`), file });
			}
			if (prior && priorState !== nowState && !(named.get(id) || []).includes(nowState)) {
				problems.push({ ...problem('staged-state-mismatch', `${file}: state changed ${priorState || '(none)'} -> ${nowState || '(none)'}, but no State: for ${now.data.id} resolves to it`), file });
			}
			// The staged edit itself moves backwards: refused here, before it is history (DOCS-084).
			if (order && prior && !override && backwards(order, priorState, nowState)) {
				problems.push({ ...problem('staged-backwards', `${file}: ${now.data.id} moves BACKWARDS ${wordOf(priorState)} -> ${wordOf(nowState)} in progression (${order.join(', ')}) - add State-Override: <reason> if it is meant`), file });
			}
		}
	}
	if (unnamed) {
		notes.push('this register does not name itself - set `registry` in config, or give its owned rows one Owner - so a qualified trailer could not be told apart from one of its own slices');
	}
	return { problems, notes, pairs: pairs.length, stagedDocs };
}

module.exports = { sliceRef, registryName, parseTrailers, legendOf, readLegend, wordOf, resolveState, planFold, applyFold, checkMessage, messageTrailers, strandedTrailers, readCommitList };
