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
	if (!text) { return []; }
	const wanted = new Set(ids.map((i) => `${i.prefix}-${i.num}${i.suffix}`));
	const out = [];
	for (const raw of text.split('\n')) {
		ID.lastIndex = 0;
		let m, hit = false;
		while ((m = ID.exec(raw)) !== null) {
			if (wanted.has(`${m[1]}-${Number.parseInt(m[2], 10)}${m[3] || ''}`)) { hit = true; break; }
		}
		if (hit) { out.push(raw.replace(/^\s*-\s*/, '').trim()); }
	}
	return [...new Set(out)];
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
		// An absolute URL, a root-relative path and a bare anchor all mean the same thing anywhere.
		if (deeper && /^\.{1,2}\//.test(target)) { target = '../' + target; }
		out.push(`[${m[1]}]: ${target}`);
	}
	return out;
}
function extractSlices(text, { statusText = '', pullupText = '', width = 5, sourceName = '' } = {}) {
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
			const name = `${idText}_${slug(own) || 'slice'}.md`;

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

			if (!m.row) {
				out.push('> No delivery-index row carries this ID. The narrative names it, so either the row');
				out.push('> was removed or the ID was never minted. Worth resolving.');
				out.push('');
			}

			if (!isAnchor) {
				// Deliberately NOT a copy of the anchor's narrative. Two documents holding the same
				// prose is how the same text drifts apart in two places.
				out.push(`> Described together with **${anchorText}**`
					+ (groupLabel ? ` — ${groupLabel.replace(/^[—–-]\s*/, '')}` : '') + '.');
				out.push('>');
				out.push(`> The shared narrative lives in that slice document. This one carries its own row,`);
				out.push('> state and history, because it is its own commitment.');
				out.push('');
			} else {
				const status = m.row ? unescapeCell(m.row.cells[m.row.cells.length - 1] || '') : '';
				if (status && status !== (m.row && m.row.title)) { out.push(status); out.push(''); }

				// The primary narrative, plus any later section that revisited the same slices.
				for (const n of [g.notes, ...(g.extraNotes || [])]) {
					if (!n) { continue; }
					const body = n.body.join('\n').trim();
					if (!body) { continue; }
					out.push(n === g.notes ? '## Notes' : `## Notes — ${n.heading}`);
					out.push('');
					out.push(body);
					out.push('');
				}

				// Evidence is gathered, never interpreted. "Mentioned in STATUS" is not "done", and a
				// generator that blurs the two produces a roadmap asserting completions nobody checked.
				const groupIds = g.members.map((x) => padId(x.id.prefix, x.id.num, x.id.suffix, widthOf(x.id.prefix)));
				const ev = evidenceFor(statusText, g.members.map((x) => x.id));
				const pull = evidenceFor(pullupText, g.members.map((x) => x.id));
				void groupIds;
				if (ev.length || pull.length) {
					out.push('## Recorded evidence');
					out.push('');
					out.push('_Lines mentioning these IDs, gathered mechanically. Evidence that something was');
					out.push('recorded — **not** a judgement that the slice is complete._');
					out.push('');
					if (ev.length) {
						out.push('**`config/STATUS.yaml`**');
						out.push('');
						ev.forEach((l) => out.push(`- ${l}`));
						out.push('');
					}
					if (pull.length) {
						out.push('**`config/STATUS-pullup.yaml`** (child repos)');
						out.push('');
						pull.forEach((l) => out.push(`- ${l}`));
						out.push('');
					}
				}
			}

			if (isAnchor) { g.file = name; }
			m.file = name;
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

	// Rewrite rows to point at their document.
	for (const g of groups) {
		for (const m of g.members) {
			if (!m.row) { continue; }
			const cells = m.row.cells.slice();
			cells[cells.length - 1] = ` See [slice notes](slices/${g.file}). `;
			lines[m.row.line] = '|' + cells.join('|') + '|';
		}
	}

	// Replace the narrative sections with an index of where they went, highest line first so the
	// earlier ranges keep their positions.
	const sections = [];
	for (const g of groups) {
		for (const n of [g.notes, ...(g.extraNotes || [])]) {
			if (n && g.file) { sections.push({ n, file: g.file }); }
		}
	}
	sections.sort((a, b) => b.n.start - a.n.start);
	for (const { n, file } of sections) {
		lines.splice(n.start, n.end - n.start, `- [${n.heading}](slices/${file})`);
	}

	return { text: lines.join('\n'), docs, rowCount: rows.length, noteCount: notes.length };
}

module.exports = {
	parseHeading, parseIndex, parseNotes, evidenceFor, slug, padId, section, rowCells, extractSlices,
	columnKey, unescapeCell, escapeCell, indexHeadings, headerMap, rowCellsBounded,
	ID_SUFFIX, ID_PREFIX, idPattern,
};
