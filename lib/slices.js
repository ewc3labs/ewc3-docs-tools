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

/** An ID, allowing the lettered variants the roadmap uses: `VS-33A`. */
const ID = /\b([A-Z][A-Z0-9]{0,7})-(\d+)([A-Z]?)\b/g;

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
function parseHeading(heading) {
	const found = [];
	ID.lastIndex = 0;
	let m;
	while ((m = ID.exec(heading)) !== null) {
		found.push({ prefix: m[1], num: Number.parseInt(m[2], 10), suffix: m[3] || '', raw: m[0] });
	}
	if (!found.length) { return null; }

	const ids = [];
	const isRange = /\b(?:through|thru|to)\b/i.test(heading) && found.length === 2;

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
function parseIndex(lines) {
	const sec = section(lines, 'Delivery Index');
	if (!sec) { return []; }
	const rows = [];
	// Column count comes from the nearest header row above, which is well-formed by construction.
	// Guessing it from the data row instead is what let a stray pipe eat the end of a paragraph.
	let columns = 0;
	for (let i = sec.start; i < sec.end; i++) {
		const line = lines[i];
		if (!line.trim().startsWith('|')) { continue; }

		if (/^\|\s*ID\s*\|/i.test(line.trim())) { columns = rowCells(line).length; continue; }
		if (!columns) { continue; }

		const cells = rowCellsBounded(line, columns);
		const first = (cells[0] || '').trim();
		const m = /^([A-Z][A-Z0-9]{0,7})-(\d+)([A-Z]?)$/.exec(first);
		if (!m) { continue; }
		rows.push({
			line: i,
			prefix: m[1], num: Number.parseInt(m[2], 10), suffix: m[3] || '',
			id: first,
			cells,
			state: (cells[1] || '').trim(),
			title: (cells[2] || '').trim(),
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
function extractSlices(text, { statusText = '', pullupText = '', width = 5, sourceName = '' } = {}) {
	const lines = text.split('\n');
	const rows = parseIndex(lines);
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
		const first = g.members[0];
		if (!first) { continue; }
		const anchor = first.id;
		const title = g.label || (first.row && first.row.title) || '';
		const name = `${padId(anchor.prefix, anchor.num, anchor.suffix, width)}_${slug(title) || 'slice'}.md`;
		g.file = name;

		const ids = g.members.map((m) => m.id);
		const shown = ids.map((i) => padId(i.prefix, i.num, i.suffix, width));
		const out = [];

		out.push(`# ${shown.join(', ')}${title ? ' — ' + title.replace(/^[—–-]\s*/, '') : ''}`);
		out.push('');
		out.push('> Generated by `ewc3-docs migrate-project` from '
			+ (sourceName ? `\`${sourceName}\`` : 'the roadmap') + '.');
		out.push('> The roadmap row for each slice below points here. **The one-line summary for the');
		out.push('> table has deliberately not been written** — deciding what a slice is about, and');
		out.push('> whether it is finished, is judgement. Write it from what follows.');
		out.push('');

		for (const m of g.members) {
			const idText = padId(m.id.prefix, m.id.num, m.id.suffix, width);
			if (!m.row) {
				out.push(`## ${idText}`);
				out.push('');
				out.push('> No delivery-index row carries this ID. The narrative names it, so either the row');
				out.push('> was removed or the ID was never minted. Worth resolving.');
				out.push('');
				continue;
			}
			out.push(`## ${idText} — ${m.row.title}`);
			out.push('');
			const meta = [];
			if (m.row.state) { meta.push(`**State** ${m.row.state}`); }
			for (let c = 3; c < m.row.cells.length - 1; c++) {
				const v = (m.row.cells[c] || '').trim();
				if (v) { meta.push(v); }
			}
			if (meta.length) { out.push(meta.join(' · ')); out.push(''); }
			const status = (m.row.cells[m.row.cells.length - 1] || '').trim();
			if (status) { out.push(status); out.push(''); }
		}

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
		const ev = evidenceFor(statusText, ids);
		const pull = evidenceFor(pullupText, ids);
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

		docs.push({ file: name, content: out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n', ids: shown });
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
};
