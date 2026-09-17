'use strict';
// Pulling slice narrative out of the roadmap and into one document per slice group.
//
// THE PROBLEM. Two kinds of prose accumulate in a roadmap and neither belongs in it. The first is
// the wall of text in the delivery index's last column - a `Status` cell that has grown into three
// paragraphs with links, so the table it lives in can no longer be read as a table. The second is
// the narrative section below, `### VS-371 through VS-375 (MedFM Billing Rules Engine)`, which is a
// document wearing a heading. A 2145-line roadmap is mostly these two things.
//
// THE SHAPE. One file per GROUP, not per slice. The groups already exist and are already authored -
// they are the narrative headings, which is how the author actually thinks about the work:
//
//     ### VS-371 through VS-375 (MedFM Billing Rules Engine)   -> one document, five slices
//     ### FIX-84 (the doctor gate described a subsystem...)     -> one document, one slice
//
// This is why `modules/` is not needed: a module is just a group of related slices, and the grouping
// is already written down. Combining slices into one document costs nothing and needs no new concept.
//
// WHAT THIS DOES NOT DO. It does not write the one-line summary that should end up in the table.
// Deciding what a slice is really about, and whether it is actually finished, is judgement, and a
// generator that invents a plausible one-liner produces something that reads like a decision and is
// not one. The row is pinned to the document instead, so the summary can be written later - by a
// human, or by a local model reading one document at a time - from evidence rather than from guessing.

const fs = require('fs');
const path = require('path');
const frontmatter = require('./frontmatter.js');
const { fencedLineSet } = require('./fence.js');

/**
 * The Status cell of a register with no Doc column, for a document whose `status:` is empty. DOCS-065.
 *
 * ONE function, called by `migrate-project` and by `index`. They used to build this string separately,
 * and index rendered the empty `status:` instead - so every row of a freshly migrated register diverged
 * from its own documents at the same commit, and the adopted table lost every link to them.
 */
function pointerCell(file) {
	return `See [slice notes](${sliceHref(file)}).`;
}

/**
 * A slice document's link destination from the register. Characters that end or split a destination - a
 * space, parentheses, angle brackets - are percent-encoded, and `%` itself first. `slices/VS-1 notes.md` is
 * not a link on GitHub, and the link checker split it at the space (Codex, PR #8); `links` decodes relative
 * targets, so the encoded form resolves in both.
 */
function sliceHref(file) {
	return `slices/${String(file).replace(/[%\s()<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)}`;
}

/**
 * Code spans on one line, as [start, end) ranges. An opening run of N backticks closes only at a run of
 * exactly N, so `\`\`a\` b\`\`` is one span - splitting on any backtick run closed it early (Codex, PR #8).
 */
function codeSpans(line) {
	const spans = [];
	const re = /`+/g;
	let m;
	while ((m = re.exec(line)) !== null) {
		const run = m[0];
		const close = new RegExp(`(?<!\`)${run}(?!\`)`, 'g');
		close.lastIndex = m.index + run.length;
		const c = close.exec(line);
		if (!c) { continue; }
		spans.push([m.index, c.index + run.length]);
		re.lastIndex = c.index + run.length;
	}
	return spans;
}

/** A link target that means something different one directory down: not a URL, not rooted, not an anchor. */
const isRelativeTarget = (t) => Boolean(t) && !/^[a-z][a-z0-9+.-]*:/i.test(t) && !t.startsWith('/') && !t.startsWith('#');

/**
 * A relative link target written from directory `from`, re-expressed from directory `to` (both repo-relative).
 *
 * Computed, not prefixed. Prepending one `../` assumed text always moved from docs/project/ into its slices/,
 * so a register kept one level deeper (docs/project/roadmap/) had every moved link land one level too deep
 * (a downstream pilot, where it was most of them). A fragment or query is carried unchanged. The virtual root
 * sits several levels down so a link that climbs out of the repository - to a sibling repository - keeps
 * every `../` it needs.
 */
function relocate(target, from, to) {
	const cut = target.search(/[?#]/);
	const file = cut === -1 ? target : target.slice(0, cut);
	const suffix = cut === -1 ? '' : target.slice(cut);
	if (!file) { return target; }
	const root = '/v1/v2/v3/v4/v5/v6/v7/v8/repo';
	const absolute = path.posix.normalize(path.posix.join(root, from, file));
	const moved = path.posix.relative(path.posix.join(root, to), absolute) || '.';
	return moved + suffix;
}

/**
 * Markdown moved from the roadmap's directory into `slices/`, with every relative target repointed. DOCS-065.
 *
 * Inline links, images, and reference definitions written in the moved text. A bare sibling name
 * (`Handoff.md`) is relative too - the old rule only rebased targets starting `./` or `../`. Fenced
 * code and code spans are left exactly alone: a link in an example is not a link.
 *
 * A link whose TEXT is a code span is still a link. Splitting the line on code spans before matching
 * links hid its target along with its text, so `[\`docs/x.md\`](../x.md)` stayed at the old depth (a
 * downstream re-run). Links are matched on the whole line, with code spans allowed in their text, and a
 * match is skipped only when it STARTS inside a code span.
 */
function rebaseRelative(markdown, { from = 'docs/project', to = 'docs/project/slices' } = {}) {
	const lines = String(markdown).split('\n');
	const fenced = fencedLineSet(lines, { ambiguous: 'fenced' });
	const rebase = (target) => {
		const angle = target.startsWith('<') && target.endsWith('>');
		const bare = angle ? target.slice(1, -1) : target;
		if (!isRelativeTarget(bare)) { return target; }
		const moved = relocate(bare, from, to);
		return angle ? `<${moved}>` : moved;
	};
	return lines.map((line, i) => {
		if (fenced.has(i)) { return line; }
		const def = /^( {0,3}\[[^\]]+\]:[ \t]*)(<[^>]*>|\S+)(.*)$/.exec(line);
		if (def) { return def[1] + rebase(def[2]) + def[3]; }
		const spans = codeSpans(line);
		const inSpan = (at) => spans.some(([s, e]) => at >= s && at < e);
		return line.replace(/(!?\[(?:`[^`]*`|[^\]`])*\]\()(<[^>]*>|[^)\s]+)/g,
			(w, pre, target, at) => (inSpan(at) ? w : pre + rebase(target)));
	}).join('\n');
}

/**
 * A line of recorded evidence, quoted so markdown does not read it as links. DOCS-065.
 *
 * Status files are written in their own notation, where `[VS-1][FIX-9]` is two ids - and markdown reads
 * a reference link to an undefined label. Brackets are escaped, and so is a `(` straight after one,
 * because `\](` still opens an inline link to a link checker. It renders as the same characters. Code
 * spans are left alone, since a backslash would show inside one.
 */
function quoteEvidence(line) {
	const escape = (part) => part.replace(/[[\]]/g, '\\$&').replace(/\\\]\(/g, '\\]\\(');
	let out = '';
	let at = 0;
	for (const [s, e] of codeSpans(line)) {
		out += escape(line.slice(at, s)) + line.slice(s, e);
		at = e;
	}
	return out + escape(line.slice(at));
}

/** An ID, allowing the lettered variants the roadmap uses: `VS-33A`. */
/**
 * THE ID SUFFIX GRAMMAR, IN ONE PLACE.
 *
 * Two suffix forms, both in live use and both DISTINCT IDS rather than annotations on a base:
 *
 *   `a`/`b`/`c`  a SUB-SLICE of a parent      VS-203a, VS-203b, VS-203c
 *   `-R<n>`      a FOLLOW-ON REVISION          FIX-09-R1, VS-87-R1
 *
 * The proof that they are ids and not decorations is that they carry INDEPENDENT STATES:
 * FIX-09-R1 is smoked while FIX-09 is coded, and VS-203c is planned while VS-203a and
 * VS-203b are coded. A revision-of shares its parent state; these do not.
 *
 * Spelled out separately in 18 places across four files before this, in four different forms,
 * and it had already drifted: this toolkit's own tests use `VS-33A`, so the grammar decided
 * suffixes were uppercase while the estate writes them lowercase - and eleven authored rows
 * in SX_Coder were invisible to every check for months. Build the regexes from ONE source.
 */
const ID_SUFFIX = '(?:[A-Za-z]|-R\\d+)?';
const ID_PREFIX = '([A-Z][A-Z0-9]{0,7})';

/** An id pattern with the suffix captured, for the given anchoring. */
function idPattern(before, after, flags) {
	return new RegExp(before + ID_PREFIX + '-(\\d+)(' + ID_SUFFIX + ')' + after, flags);
}

const ID = idPattern('\\b', '\\b', 'g');

/**
 * The one spelling of an id for MATCHING: `VS-4`, `VS-004` and `VS-00004` are the same slice. DOCS-062.
 *
 * Padding is a convention of how an id is WRITTEN, never part of which slice it names. Matching on the
 * written form made a document declaring `id: VS-004` invisible to row `VS-4`, so migration generated a
 * second document for a slice that already had one. Returns null for anything that is not an id.
 */
function normalizeId(text) {
	const m = idPattern('^', '$', '').exec(String(text === undefined || text === null ? '' : text).trim());
	return m ? `${m[1]}-${Number.parseInt(m[2], 10)}${m[3] || ''}` : null;
}

/**
 * What each EXISTING slice document is, before migration decides anything. DOCS-062.
 *
 * `entries` is `[{ name, text }]`. Each comes back with `frontmatter` one of `ok`, `none`, `no-id` or
 * `unreadable`; the `id` it can be matched by, normalised, or null; and where that id came from. A
 * readable `id:` wins. Otherwise the filename's leading id is used, because an older document predating
 * frontmatter still carries its slice in its name - and without it, that document matches nothing and
 * its prose is regenerated over.
 */
function inventorySlices(entries) {
	// `written` is the id as it appears, for DISPLAY: the inventory printed XX-12 where the filename, the row
	// and the frontmatter all said XX-012, so a grep for XX-012 missed the line (downstream census). `id` stays
	// normalised, because matching must not care about padding.
	const fromName = (name) => {
		const m = idPattern('^', '(?=[^A-Za-z0-9]|$)', '').exec(name.replace(/\.md$/i, ''));
		return m ? { id: `${m[1]}-${Number.parseInt(m[2], 10)}${m[3] || ''}`, written: m[0] } : { id: null, written: null };
	};
	return entries.map(({ name, text }) => {
		let parsed;
		try {
			parsed = frontmatter.read(text);
		} catch (err) {
			return { name, frontmatter: 'unreadable', reason: err.message, ...fromName(name), idFrom: 'filename' };
		}
		if (!parsed.had) { return { name, frontmatter: 'none', ...fromName(name), idFrom: 'filename' }; }
		const declared = parsed.data && parsed.data.id !== undefined ? normalizeId(parsed.data.id) : null;
		if (!declared) { return { name, frontmatter: 'no-id', ...fromName(name), idFrom: 'filename' }; }
		return { name, frontmatter: 'ok', id: declared, idFrom: 'frontmatter', written: String(parsed.data.id).trim() };
	});
}

/** Pad the numeric part for filenames, so 9 and 90 sort the way a reader expects. */
function padId(prefix, num, suffix, width) {
	return `${prefix}-${String(num).padStart(width, '0')}${suffix || ''}`;
}

/**
 * Work out which slices a narrative heading covers, and what to call the group.
 *
 * Sixteen distinct forms appear in one roadmap, which is what happens when a heading is prose:
 *
 *     VS-18                                  a single slice
 *     VS-19 + VS-21                          an explicit list
 *     VS-376 / VS-377 (label)                the same, with a different separator
 *     VS-34 to VS-37 (label)                 an inclusive range
 *     VS-47 through VS-52                    the same word, spelled differently
 *     VS-33A through VS-33D                  a lettered range
 *     VS-30 family                           deliberately open-ended
 *     VS-183 — Queue/Role Policy Consolidation
 *
 * `family` is NOT expanded. It means "this and whatever else turned up", and inventing members would
 * put IDs in the index that nobody minted. The anchor slice is claimed; anything else in the family
 * finds its own way here when its row is matched.
 */
/**
 * Text allowed to sit BETWEEN two IDs that are part of the same declaration.
 *
 * Commas, slashes and the range words join IDs. An em-dash or a colon does not - it ends the
 * declaration and begins the label. That single distinction is the whole rule, and it is why
 * `HDC-13 — VS-413: ...` declares one ID rather than two.
 */
const JOINS_IDS = /^[\s,/&+]*(?:(?:and|through|thru|to|plus)[\s,/&+]*)*$/i;

function parseHeading(heading) {
	const all = [];
	ID.lastIndex = 0;
	let m;
	while ((m = ID.exec(heading)) !== null) {
		all.push({
			prefix: m[1], num: Number.parseInt(m[2], 10), suffix: m[3] || '', raw: m[0],
			at: m.index, end: m.index + m[0].length,
		});
	}
	if (!all.length) { return null; }

	// Only the leading run declares. A heading names its slice first and then talks about it,
	// and everything it says afterwards is a CITATION - including IDs belonging to other repos.
	// A mention is not a mint.
	const found = [all[0]];
	for (let i = 1; i < all.length; i++) {
		if (!JOINS_IDS.test(heading.slice(all[i - 1].end, all[i].at))) { break; }
		found.push(all[i]);
	}

	const ids = [];
	// The range word has to sit BETWEEN the two IDs. Testing the whole heading meant a label
	// like "VS-10, VS-40 - porting the old parser to the new one" read as a 31-slice range.
	const isRange = found.length === 2
		&& /\b(?:through|thru|to)\b/i.test(heading.slice(found[0].end, found[1].at));

	if (isRange && found[0].prefix === found[1].prefix) {
		const [a, b] = found;
		if (a.suffix && b.suffix && a.num === b.num) {
			// VS-33A through VS-33D
			for (let c = a.suffix.charCodeAt(0); c <= b.suffix.charCodeAt(0); c++) {
				ids.push({ prefix: a.prefix, num: a.num, suffix: String.fromCharCode(c) });
			}
		} else {
			for (let n = a.num; n <= b.num; n++) {
				ids.push({ prefix: a.prefix, num: n, suffix: '' });
			}
		}
	} else {
		ids.push(...found.map((f) => ({ prefix: f.prefix, num: f.num, suffix: f.suffix })));
	}

	// The label is whatever the heading says once the IDs and the words joining them are removed.
	//
	// Matching a parenthesised phrase instead LOOKS right and quietly mislabels: `VS-358 addendum —
	// the tabled "null means the header" idea (Wilson, 2026-08-12)` ends in an ATTRIBUTION, and a
	// trailing-paren rule names that document "Wilson, 2026-08-12". Removing what we already
	// understand, and keeping the rest, cannot make that mistake.
	// Connectives are stripped only from the LEADING run, where they joined the IDs. Removing them
	// everywhere turns "the ladder that could not finish, AND the flavor gate that picked padding"
	// into a sentence missing its conjunction - damaging the prose it was supposed to preserve.
	let label = heading.replace(ID, ' ').replace(/\s+/g, ' ').trim();
	let before;
	do {
		before = label;
		label = label.replace(/^(?:through|thru|to|and|family|addendum)\b/i, '').replace(/^[\s+/,;:]+/, '').trim();
	} while (label !== before);
	// A heading whose whole meaning was the IDs (`VS-18`, `VS-30 family`) leaves nothing behind, and
	// should fall back to the slice title from the table rather than invent one.
	if (/^\(.*\)$/.test(label)) { label = label.slice(1, -1); }
	label = label.replace(/`/g, '').trim();

	return { ids, label, family: /\bfamily\b/i.test(heading), raw: heading.trim() };
}

/**
 * Split a markdown table row into cells, respecting escaped pipes.
 *
 * `\|` inside a cell is a LITERAL pipe, not a column boundary - and it is not rare: 504 of the 493
 * index rows in one roadmap contain at least one, because prose about code says things like
 * "`\|`-joined the store list". Splitting naively finds phantom columns, so the last "cell" is a
 * fragment from the middle of the text. Rewriting that fragment corrupts the row AND hands the
 * slice document only the tail of what it should have received - losing most of the prose from both
 * places at once, quietly, in a migration whose entire promise is that it loses nothing.
 */
const CELL_SPLIT = /(?<!\\)\|/;

/**
 * Split a row into exactly `n` cells, letting the LAST one keep every pipe it contains.
 *
 * Escaping is not enough, because authors also write an unescaped pipe inside a code span:
 * "reads `DSET SFE | unresolved`". GFM arguably splits there too, so the source is genuinely
 * ambiguous - but the intent is obvious, and a migration that silently deletes the tail of a
 * paragraph because of a stray pipe is not defensible either way.
 *
 * The table HEADER is well-formed, so it tells us how many columns there are. Consume that many
 * boundaries and treat the remainder as the final cell. The Status column is last in every table
 * here, which is exactly the column that contains prose.
 */
function rowCellsBounded(line, n) {
	let s = line.trim();
	if (s.startsWith('|')) { s = s.slice(1); }
	if (s.endsWith('|') && !s.endsWith('\\|')) { s = s.slice(0, -1); }

	const out = [];
	let buf = '';
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === '|' && s[i - 1] !== '\\' && out.length < n - 1) { out.push(buf); buf = ''; continue; }
		buf += c;
	}
	out.push(buf);
	return out;
}

function rowCells(line) {
	const parts = line.split(CELL_SPLIT);
	if (parts.length && parts[0].trim() === '') { parts.shift(); }
	if (parts.length && parts[parts.length - 1].trim() === '') { parts.pop(); }
	return parts;
}

/** Section of the document between `## Heading` and the next `## `. */
function section(lines, title) {
	const start = lines.findIndex((l) => l.trim().toLowerCase().startsWith('## ' + title.toLowerCase()));
	if (start === -1) { return null; }
	let end = lines.length;
	for (let i = start + 1; i < lines.length; i++) {
		if (/^##\s/.test(lines[i])) { end = i; break; }
	}
	return { start, end };
}

/**
 * Every delivery-index row, with the line it sits on so it can be rewritten in place.
 *
 * Only rows inside the Delivery Index are collected. The same ID shape appears in the register and
 * in prose tables elsewhere, and rewriting one of those would move text that was never narrative.
 */
/**
 * Which column holds what, read off the header row rather than assumed from its position.
 *
 * Deliberately a small synonym table and not a fuzzy match: `Slice` and `Title` both name the
 * one-line description, and every estate spells at least one of them. An unrecognised heading is
 * left alone - it stays in `cells` and is carried through as an extra field, which is how `Est`,
 * `Lane`, `Priority` and `Next CI/CD step` survive a migration nobody wrote code for.
 */
const COLUMN_SYNONYMS = {
	id: ['id'],
	state: ['state', 'stage'],
	title: ['slice', 'title', 'name', 'summary', 'description'],
};

/**
 * A Delivery Index header cell turned into a frontmatter key.
 *
 * `Next CI/CD step` becomes `next_ci_cd_step`, `Design / anchor` becomes `design_anchor`. The
 * point is not beauty, it is REVERSIBILITY BY NAME: the roadmap header is the schema, so a
 * column can be rendered back into the table it came from without storing a column order
 * anywhere. Rename a column and the field simply stops matching, which is visible.
 */
function columnKey(name) {
	return String(name).trim().toLowerCase()
		.replace(/[`*_]/g, '')
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

/**
 * Table cells escape pipes; frontmatter scalars must not, and vice versa.
 *
 * Getting this backwards is silent: a title reaches frontmatter as `DSET\|HDCNUM`, renders back
 * into the table as `DSET\\|HDCNUM`, and gains a backslash on every single round trip.
 */
function unescapeCell(s) {
	return String(s).replace(/\\\|/g, '|').trim();
}

function escapeCell(s) {
	return String(s).replace(/\|/g, '\\|');
}

/** The Delivery Index header cells, which are the column schema. */
function indexHeadings(lines) {
	const sec = section(lines, 'Delivery Index');
	if (!sec) { return []; }
	for (let i = sec.start; i < sec.end; i++) {
		const line = lines[i].trim();
		if (line.startsWith('|') && /^\|\s*ID\s*\|/i.test(line)) { return rowCells(lines[i]); }
	}
	return [];
}

function headerMap(head) {
	const map = {};
	head.forEach((cell, i) => {
		const name = cell.trim().toLowerCase().replace(/[`*_]/g, '');
		for (const [key, words] of Object.entries(COLUMN_SYNONYMS)) {
			if (map[key] === undefined && words.includes(name)) { map[key] = i; }
		}
	});
	return map;
}

function parseIndex(lines) {
	const sec = section(lines, 'Delivery Index');
	if (!sec) { return []; }
	const rows = [];
	// Column count comes from the nearest header row above, which is well-formed by construction.
	// Guessing it from the data row instead is what let a stray pipe eat the end of a paragraph.
	let columns = 0;
	// ...and so does column MEANING. Position was hardcoded here (state=1, title=2) against the
	// house style `| ID | State | Slice |`. HDCTranslators writes `| ID | Title | State |`, so every
	// slice document generated for it was named after its state: HDC-00001_done.md, and so on down
	// the file. Nothing errored, and the output looked plausible enough to sit on disk unnoticed.
	//
	// Five roadmaps in this estate have five different column layouts. Reading the header is the
	// only thing that works on all of them, and it costs one lookup table.
	let col = null;
	for (let i = sec.start; i < sec.end; i++) {
		const line = lines[i];
		if (!line.trim().startsWith('|')) { continue; }

		if (/^\|\s*ID\s*\|/i.test(line.trim())) {
			const head = rowCells(line);
			columns = head.length;
			col = headerMap(head);
			continue;
		}
		if (!columns) { continue; }

		const cells = rowCellsBounded(line, columns);
		const first = (cells[0] || '').trim();
		const m = idPattern('^', '$', '').exec(first);
		if (!m) { continue; }
		const at = (name) => {
			const idx = col ? col[name] : undefined;
			return idx === undefined ? '' : (cells[idx] || '').trim();
		};
		rows.push({
			line: i,
			prefix: m[1], num: Number.parseInt(m[2], 10), suffix: m[3] || '',
			id: first,
			cells,
			columns: col,
			state: at('state'),
			title: at('title'),
		});
	}
	return rows;
}

/** Every narrative section under Slice Notes, with its body. */
function parseNotes(lines) {
	const sec = section(lines, 'Slice Notes');
	if (!sec) { return []; }
	const out = [];
	let current = null;
	for (let i = sec.start + 1; i < sec.end; i++) {
		if (/^###\s/.test(lines[i])) {
			if (current) { current.end = i; out.push(current); }
			const heading = lines[i].replace(/^###\s+/, '');
			current = { heading, parsed: parseHeading(heading), start: i, end: sec.end, body: [] };
			continue;
		}
		if (current) { current.body.push(lines[i]); }
	}
	if (current) { out.push(current); }
	return out.filter((n) => n.parsed);
}

/** A filename-safe slug: readable, bounded, and the tail is the searchable part. */
function slug(text, max = 58) {
	const s = text
		.replace(/`/g, '')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/[*_]/g, '')
		.replace(/[^A-Za-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
	return s.length > max ? s.slice(0, max).replace(/_+$/, '') : s;
}

/**
 * Lines in a STATUS file that mention any of these IDs.
 *
 * Deterministic on purpose. This is evidence that something was recorded, not a judgement that the
 * slice is done - the difference matters, and conflating them is how a roadmap ends up asserting
 * completion nobody verified.
 */
function evidenceFor(text, ids) {
	return evidenceEntries(text, ids).map((e) => e.text);
}

/**
 * `evidenceFor` with where each line came from: `[{ text, index, ids }]` - its 0-based line, and the normalized ids it
 * was matched by - so a line can be dated against when those ids were minted (DOCS-075). First occurrence of a text wins.
 */
function evidenceEntries(text, ids) {
	if (!text) { return []; }
	const wanted = new Set(ids.map((i) => `${i.prefix}-${i.num}${i.suffix}`));
	const out = [];
	const seen = new Set();
	text.split('\n').forEach((raw, index) => {
		ID.lastIndex = 0;
		let m;
		const hit = new Set();
		while ((m = ID.exec(raw)) !== null) {
			const k = `${m[1]}-${Number.parseInt(m[2], 10)}${m[3] || ''}`;
			if (wanted.has(k)) { hit.add(k); }
		}
		const line = raw.replace(/^\s*-\s*/, '').trim();
		if (hit.size && !seen.has(line)) { seen.add(line); out.push({ text: line, index, ids: [...hit] }); }
	});
	return out;
}

/**
 * Evidence lines split into `kept` and `apart` (DOCS-075). A line is apart only when EVERY id it matched has a mint date
 * and the line's date is strictly earlier - the same day is not before, since a mint and its first status line often
 * share one. With no `mint` (history unavailable), nothing is apart.
 */
function splitEvidence(text, ids, dates, mint) {
	const kept = [];
	const apart = [];
	for (const e of evidenceEntries(text, ids)) {
		const date = dates ? dates[e.index] : null;
		const before = Boolean(mint && date && e.ids.every((k) => mint.has(k) && date < mint.get(k)));
		(before ? apart : kept).push(e);
	}
	return { kept, apart };
}

const key = (o) => `${o.prefix}-${o.num}${o.suffix || ''}`;

/**
 * Move the narrative out of the roadmap and into one document per group.
 *
 * Returns the rewritten roadmap and the documents to write beside it. Nothing is deleted: every
 * fat `Status` cell and every narrative section ends up in a document, and the row that used to
 * carry the text now points at it.
 */
/** Reference definitions (`[label]: target`) declared anywhere in a document. */
function referenceDefinitions(text) {
	const defs = new Map();
	for (const line of text.split('\n')) {
		const m = /^ {0,3}\[([^\]]+)\]:\s*(\S.*)$/.exec(line);
		if (m) { defs.set(m[1].toLowerCase(), m[2].trim()); }
	}
	return defs;
}

/**
 * The definitions a document actually uses, re-pointed for its new depth.
 *
 * Only what is used: copying all of them would make every slice document claim links it does
 * not have, and `links` would then report the unused ones as orphaned targets.
 */
function definitionsFor(content, defs, deeper) {
	const out = [];
	const seen = new Set();
	for (const m of content.matchAll(/\]\[([^\]]+)\]/g)) {
		const label = m[1].toLowerCase();
		if (seen.has(label) || !defs.has(label)) { continue; }
		seen.add(label);
		let target = defs.get(label);
		// A relative target written from the roadmap means one directory up from a slice document.
		// An absolute URL, a root-relative path and a bare anchor all mean the same thing anywhere. A
		// bare sibling name is relative too; only `./` and `../` were rebased before (DOCS-065).
		const bare = target.replace(/^<|>$/g, '');
		if (deeper && isRelativeTarget(bare)) {
			const moved = relocate(bare, 'docs/project', 'docs/project/slices');
			target = target.startsWith('<') ? `<${moved}>` : moved;
		}
		out.push(`[${m[1]}]: ${target}`);
	}
	return out;
}
/**
 * `existing` maps an ID to the filename of a slice document that ALREADY EXISTS and was written by
 * a human. Those are never regenerated - migration is a one-time import, and a second run must not
 * overwrite authored prose with a projection of the row that prose replaced. The register still
 * points at them, so an adopted repo and a migrating one produce the same index.
 */
function extractSlices(text, { statusText = '', pullupText = '', dating = null, width = 5, sourceName = '',
	existing = new Map(), legacy = new Map(), reserved = new Set(), reservePath = (rel) => rel } = {}) {
	// Keyed by the NORMALISED id, so a document declaring VS-004 is found for row VS-4 (DOCS-062).
	// `legacy` maps an id to the backup of an older document for it that had no usable frontmatter.
	const lookup = (map, id) => { for (const [k, v] of map) { if ((normalizeId(k) || k) === normalizeId(id)) { return v; } } return undefined; };
	const lines = text.split('\n');
	const rows = parseIndex(lines);
	const headings = indexHeadings(lines);
	const refDefs = referenceDefinitions(text);
	// `width` may be a single number or a per-prefix map, because padding is a convention of a
	// series rather than of a file.
	const widthOf = (p) => (width && typeof width === 'object' ? (width[p] || 0) : width);
	const notes = parseNotes(lines);

	const byId = new Map(rows.map((r) => [key(r), r]));
	const claimed = new Set();
	const groups = [];

	// Authored groups first: the narrative headings ARE the grouping, already decided by whoever
	// wrote them. A row claimed by an earlier group stays there - a slice belongs to one document,
	// and silently duplicating it into two is how the same text drifts apart in two places.
	const ownerOf = new Map();

	for (const n of notes) {
		const members = [];
		for (const id of n.parsed.ids) {
			const k = key(id);
			if (claimed.has(k)) { continue; }
			claimed.add(k);
			members.push({ id, row: byId.get(k) || null });
		}

		// A section whose IDs were ALL claimed by an earlier one is not a mistake and not empty: it is
		// a second pass over the same work - `### VS-273 / FIX-89 — the target model` after both have
		// already been written about. It gets appended to the document that owns those IDs.
		//
		// Dropping it instead is not a cosmetic loss. The group would carry no members, be skipped
		// before it was ever assigned a filename, and then still be spliced out of the roadmap and
		// replaced with a link to `slices/undefined` - deleting the prose and pointing at nothing.
		if (!members.length) {
			const host = n.parsed.ids.map((i) => ownerOf.get(key(i))).find(Boolean);
			if (host) { host.extraNotes.push(n); continue; }
			// Named only IDs that have no row and no earlier document: keep it, anchored on the first.
			members.push({ id: n.parsed.ids[0], row: byId.get(key(n.parsed.ids[0])) || null });
		}

		const g = { notes: n, label: n.parsed.label, members, extraNotes: [], fromNarrative: true };
		for (const m of members) { ownerOf.set(key(m.id), g); }
		groups.push(g);
	}

	// Then every row nobody's narrative mentioned: still gets a document, because its Status cell is
	// often the only prose the slice has.
	for (const r of rows) {
		if (claimed.has(key(r))) { continue; }
		claimed.add(key(r));
		groups.push({
			notes: null,
			label: '',
			members: [{ id: r, row: r }],
			extraNotes: [],
			fromNarrative: false,
		});
	}

	const docs = [];
	const kept = [];
	for (const g of groups) {
		const anchorMember = g.members[0];
		if (!anchorMember) { continue; }
		const groupLabel = g.label || (anchorMember.row && anchorMember.row.title) || '';

		// ONE DOCUMENT PER ID. A group is a shared NARRATIVE, not a shared identity: the roadmap
		// carries a separate row, state and title for each member, so collapsing them into one
		// document loses the very fields the Delivery Index is regenerated from. The narrative
		// stays with the anchor and the rest point at it, so nothing is duplicated either.
		for (const m of g.members) {
			const isAnchor = m === anchorMember;
			const idText = padId(m.id.prefix, m.id.num, m.id.suffix, widthOf(m.id.prefix));
			const anchorText = padId(anchorMember.id.prefix, anchorMember.id.num,
				anchorMember.id.suffix, widthOf(anchorMember.id.prefix));
			const own = (m.row && m.row.title) || (isAnchor ? groupLabel : '');

			// AN AUTHORED DOCUMENT IS NEVER REGENERATED, and it keeps the name it already has.
			// Deriving a fresh name from the row would emit a second document for the same ID under a
			// different filename - two declaring surfaces for one commitment, which is the defect the
			// slice-document model exists to remove, manufactured by the tool that implements it.
			const held = lookup(existing, idText);
			const prior = lookup(legacy, idText);
			// A KEPT document's filename is taken, even when it names another slice. A kept document keeps
			// the name its author chose, and a verbatim copy of it under the name this row would generate
			// replaced the generated document - both rows then pointed at one file (Codex, PR #7). The
			// generated document is renamed instead; the authored one is never touched. Compared
			// case-insensitively, because the filesystems these repos live on are.
			let name = held || `${idText}_${slug(own) || 'slice'}.md`;
			for (let n = 1; !held && reserved.has(name.toLowerCase()); n++) {
				name = `${idText}_${slug(own) || 'slice'}_generated${n > 1 ? n : ''}.md`;
			}

			// Frontmatter is the declaration. Everything the row said is carried as a field, keyed
			// off the header cell, so `Est`, `Lane`, `Priority` and `Next CI/CD step` survive a
			// migration that was never written with them in mind - and can be rendered back.
			const data = { id: idText };
			if (m.row) {
				const cols = m.row.columns || {};
				if (m.row.state) { data.state = unescapeCell(m.row.state); }
				if (m.row.title) { data.title = unescapeCell(m.row.title); }
				const taken = new Set([cols.id, cols.state, cols.title]);
				for (let c = 0; c < m.row.cells.length; c++) {
					if (taken.has(c)) { continue; }
					const key = columnKey(headings[c] || `column_${c}`);
					const v = unescapeCell(m.row.cells[c] || '');
					if (key && v && data[key] === undefined) { data[key] = v; }
				}
			}
			// The register must still be able to REACH the document it was projected from. That
			// pointer used to ride in the Status cell, which is now emptied when its text moves to
			// the body, so it belongs in `Doc` - the column that means exactly this.
			//
			// A real markdown link, not a bare path. It was a bare path for one commit, because
			// `links` read frontmatter as prose and reported a link in a field value as an undefined
			// reference - so the workaround was to write something that was not a link. `DOCS-052` fixed
			// the cause in `lib/links.js`, and a bare path left all 37 documents unreachable, which
			// `links` reports as orphans and which defeats the point of an index. An authored Doc
			// value is never replaced.
			const docKey = columnKey('Doc');
			if (!data[docKey] || /^[—–-]$/.test(String(data[docKey]).trim())) {
				data[docKey] = `[${idText}](slices/${name})`;
			}
			if (!isAnchor) { data.see = anchorText; }
			if (sourceName) { data.source = sourceName; }

			const out = [];
			const ownText = unescapeCell(own);
			out.push(`# ${idText}${ownText ? ' — ' + ownText.replace(/^[—–-]\s*/, '') : ''}`);
			out.push('');
			const src = sourceName ? "`" + sourceName + "`" : 'the roadmap';
			out.push('> Generated by `ewc3-docs migrate-project` from ' + src
				+ '. The fields above are that roadmap row, carried across verbatim.');
			out.push('> **The one-line summary has deliberately not been written.** If `title` reads as a');
			out.push('> paragraph rather than a summary, that is the row as it stands — deciding what a slice');
			out.push('> is about, and whether it is finished, is judgement.');
			out.push('');

			// AN OLDER DOCUMENT FOR THIS SLICE EXISTED, and its prose is not in this one. It was backed up
			// verbatim rather than merged: which of its words still hold is judgement, and a merge that
			// guesses reads like a decision nobody made (DOCS-062).
			if (prior) {
				out.push(`> ⚠️ **An earlier document for this slice exists:** [${path.basename(prior)}](${prior}).`);
				out.push('> It had no usable frontmatter, so it was backed up verbatim and NOT merged. Carry what');
				out.push('> still holds into this document by hand, then delete the backup.');
				out.push('');
			}

			if (!m.row) {
				out.push('> No delivery-index row carries this ID. The narrative names it, so either the row');
				out.push('> was removed or the ID was never minted. Worth resolving.');
				out.push('');
			}

			// THE ROW'S STATUS MOVES TO THIS DOCUMENT'S BODY, FOR EVERY MEMBER - anchor or follower. DOCS-065.
			//
			// Frontmatter is the declaration, so `index` renders the Status cell from it: text left there is
			// put straight back into a register that was meant to be thin (measured once at 341 chars per
			// row after migrating, 5961 after re-indexing). Only the anchor's used to move, so a follower
			// kept its paragraph in frontmatter and came back the same way. The cell is emptied whether or not it had
			// text worth moving: an empty `status:` is what the summarizer owes, and a register with no Doc
			// column renders its pointer there instead (`pointerCell`). Relative links are repointed, because
			// the text now sits one directory down.
			const statusCell = m.row ? m.row.cells.length - 1 : -1;
			const ownStatus = m.row ? unescapeCell(m.row.cells[statusCell] || '') : '';
			const statusKey = m.row ? columnKey(headings[statusCell] || '') : '';
			const moveStatus = () => {
				if (ownStatus && ownStatus !== (m.row && m.row.title)) {
					out.push(rebaseRelative(ownStatus));
					out.push('');
				}
				if (statusKey && statusKey !== 'id' && statusKey !== columnKey(headings[(m.row.columns || {}).title] || '')) {
					data[statusKey] = '';
				}
			};

			if (!isAnchor) {
				// Deliberately NOT a copy of the anchor's narrative. Two documents holding the same
				// prose is how the same text drifts apart in two places.
				out.push(`> Described together with **${anchorText}**`
					+ (groupLabel ? ` — ${groupLabel.replace(/^[—–-]\s*/, '')}` : '') + '.');
				out.push('>');
				out.push(`> The shared narrative lives in that slice document. This one carries its own row,`);
				out.push('> state and history, because it is its own commitment.');
				out.push('');
				if (m.row) { moveStatus(); }
			} else {
				if (m.row) { moveStatus(); }

				// The primary narrative, plus any later section that revisited the same slices.
				for (const n of [g.notes, ...(g.extraNotes || [])]) {
					if (!n) { continue; }
					const body = n.body.join('\n').trim();
					if (!body) { continue; }
					out.push(n === g.notes ? '## Notes' : `## Notes — ${n.heading}`);
					out.push('');
					out.push(rebaseRelative(body));
					out.push('');
				}

				// Evidence is gathered, never interpreted. "Mentioned in STATUS" is not "done", and a
				// generator that blurs the two produces a roadmap asserting completions nobody checked.
				//
				// DATED, TOO (DOCS-075). A line recorded before its id was minted is an earlier, unminted use of the
				// number - set apart under its own label, never dropped, and never presented as this slice's evidence.
				const ids = g.members.map((x) => x.id);
				const written = new Map(g.members.map((x) => [key(x.id), padId(x.id.prefix, x.id.num, x.id.suffix, widthOf(x.id.prefix))]));
				const ev = splitEvidence(statusText, ids, dating && dating.status, dating && dating.ok ? dating.mint : null);
				const pull = splitEvidence(pullupText, ids, dating && dating.pullup, dating && dating.ok ? dating.mint : null);
				if (ev.kept.length || pull.kept.length || ev.apart.length || pull.apart.length) {
					const files = (pick) => {
						for (const [label, part] of [['**`config/STATUS.yaml`**', ev], ['**`config/STATUS-pullup.yaml`** (child repos)', pull]]) {
							if (!part[pick].length) { continue; }
							out.push(label);
							out.push('');
							part[pick].forEach((e) => out.push(`- ${quoteEvidence(e.text)}`));
							out.push('');
						}
					};
					out.push('## Recorded evidence');
					out.push('');
					out.push('_Lines mentioning these IDs, gathered mechanically. Evidence that something was');
					out.push('recorded — **not** a judgement that the slice is complete._');
					out.push('');
					if (dating && !dating.ok) {
						out.push(`_Dates not checked against when these IDs were minted: ${dating.reason}._`);
						out.push('');
					} else if (dating) {
						const undated = ids.filter((i) => !dating.mint.has(key(i)));
						if (undated.length) {
							out.push(`_${undated.map((i) => written.get(key(i))).join(', ')}: no committed row, so dates were not checked against a mint._`);
							out.push('');
						}
					}
					files('kept');
					const apart = [...ev.apart, ...pull.apart];
					if (apart.length) {
						// A SET-ASIDE IS A PROMPT, NEVER A VERDICT (DOCS-078). "An earlier, unminted use of the number"
						// was asserted as the explanation - and on a BACKFILLED row, one written down after the work it
						// records, it is exactly backwards: every line really is that slice's evidence. The tool knows
						// WHEN, not WHY, so it says when and asks. Measured downstream: six of a row's seven lines set
						// apart with the wrong story attached, and moved back by hand.
						const involved = [...new Set(apart.flatMap((e) => e.ids))].sort();
						const named = involved.map((k) => `${written.get(k) || k} (${dating.mint.get(k)})`);
						out.push(`### Recorded before this row existed (${involved.map((k) => dating.mint.get(k)).join(', ')})`);
						out.push('');
						out.push(`_These lines name ${named.join(' and ')} but were recorded before that row first appeared._`);
						out.push('_Either the number was used before it was minted, for other work, or this row was written');
						out.push('down after the work it records. **The tool cannot tell which**, so nothing is thrown away and');
						out.push('nothing is claimed: decide, and move them back above if they belong to this slice._');
						out.push('');
						// The one thing the DATA does say: no line at all after the row is what a backfill looks like.
						const allApart = involved.every((k) => ![...ev.kept, ...pull.kept].some((e) => e.ids.includes(k)));
						if (allApart) {
							out.push(`_Every line for ${named.join(' and ')} predates its row, which is what a row written down`);
							out.push('after the work looks like._');
							out.push('');
						}
						files('apart');
					}
				}
			}

			if (isAnchor) { g.file = name; }
			m.file = name;

			// The row is still repointed at it above; only the WRITE is skipped. Counted rather than
			// silent, because "34 documents from 34 rows" and "31 documents from 34 rows, 3 already
			// authored" are different facts and a migration that quietly declines to write is
			// indistinguishable from one that quietly failed to.
			if (held) {
				kept.push(idText);
				// The narrative this row's generated document would have carried has nowhere to go - the kept
				// document is never rewritten. Marked, so its sections are backed up below instead of being
				// replaced by a link to a document that does not contain them (Codex P1, PR #7).
				if (isAnchor) { g.heldAs = idText; }
				continue;
			}

			let body = out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
			// Scan the FRONTMATTER as well as the body. A Doc column becomes a frontmatter field, so
			// [text][label] most often lands there - and links reads it there too.
			const used = definitionsFor(frontmatter.stringify(data) + String.fromCharCode(10) + body, refDefs, true);
			if (used.length) { body += '\n' + used.join('\n') + '\n'; }
			docs.push({
				file: name,
				content: frontmatter.write(body, data),
				ids: [idText],
				data,
			});
		}
	}

	// Rewrite rows to point at their OWN document.
	//
	// `m.file`, not `g.file`. Every member gets its own document, so pointing a follower row at the
	// anchor's file left that follower's own frontmatter, state and history unreachable from the
	// index - and the index exists to be a projection of exactly those documents. The shared
	// narrative link below still uses the anchor, because that prose really does live in one place.
	for (const g of groups) {
		for (const m of g.members) {
			if (!m.row) { continue; }
			const target = m.file || g.file;
			if (!target) { continue; }
			const cells = m.row.cells.slice();
			cells[cells.length - 1] = ` ${pointerCell(target)} `;
			lines[m.row.line] = '|' + cells.join('|') + '|';
		}
	}

	// Replace the narrative sections with an index of where they went, highest line first so the
	// earlier ranges keep their positions.
	//
	// A section whose slice already has a KEPT document is backed up verbatim - heading and all - before
	// the replacement, and the line links both. Merging it into the kept document would rewrite authored
	// prose; dropping it lost the narrative on adoption. `reservePath` gives each backup a path no other
	// staged file uses.
	const sections = [];
	const narratives = [];
	for (const g of groups) {
		for (const n of [g.notes, ...(g.extraNotes || [])]) {
			if (!n || !g.file) { continue; }
			let backup = null;
			if (g.heldAs) {
				backup = reservePath(`_legacy/${g.heldAs}_roadmap_notes.md`);
				narratives.push({ file: backup, content: lines.slice(n.start, n.end).join('\n').replace(/\s*$/, '\n') });
			}
			sections.push({ n, file: g.file, backup });
		}
	}
	sections.sort((a, b) => b.n.start - a.n.start);
	for (const { n, file, backup } of sections) {
		lines.splice(n.start, n.end - n.start, backup
			? `- [${n.heading}](slices/${file}) — roadmap narrative NOT merged into that document: [backup](slices/${backup})`
			: `- [${n.heading}](slices/${file})`);
	}

	return { text: lines.join('\n'), docs, kept, narratives, rowCount: rows.length, noteCount: notes.length };
}

module.exports = {
	parseHeading, parseIndex, parseNotes, evidenceFor, evidenceEntries, splitEvidence, slug, padId, section, rowCells, extractSlices,
	columnKey, unescapeCell, escapeCell, indexHeadings, headerMap, rowCellsBounded,
	ID_SUFFIX, ID_PREFIX, idPattern, normalizeId, inventorySlices, pointerCell, sliceHref, rebaseRelative, quoteEvidence,
};
