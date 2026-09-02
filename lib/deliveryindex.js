/**
 * Render a Delivery Index table FROM the slice documents that declare its rows.
 *
 * This is the return leg of the design: the slice document is the authority, and the roadmap table
 * is a projection of it. Nobody edits the table; they edit the document that owns the row, and the
 * table is regenerated.
 *
 * The column schema is not configured anywhere. It is read off the roadmap's own header row, and
 * each header cell maps to a frontmatter key by the same rule the migration used to write it. So a
 * repo keeps the columns it already chose - `Est`, `Lane`, `Priority`, `Next CI/CD step` - and the
 * renderer never has to know what any of them mean.
 *
 * What this deliberately does NOT do is invent rows. A slice document declaring an ID the roadmap
 * never had is reported, not silently added: minting is a human act in a planning surface, and a
 * generator that can mint is a generator that can mint by accident.
 */

'use strict';

const {
	section, rowCells, headerMap, columnKey, escapeCell, indexHeadings,
} = require('./slices.js');

/**
 * The numeric width each PREFIX already uses, so regeneration does not reformat every ID.
 *
 * Per prefix, because a register can host more than one series: SX_Coder's own ids are two
 * digits wide and its index also carries DW-024 and DW-025, which SX_DW pads to three. One
 * width for the whole file renamed those two rows on every single run.
 */
function detectWidths(text) {
	const lines = text.split('\n');
	const sec = section(lines, 'Delivery Index');
	const out = {};
	if (!sec) { return out; }
	const seen = new Map();
	for (let i = sec.start; i < sec.end; i++) {
		const m = /^\|\s*([A-Z][A-Z0-9]{0,7})-(\d+)([A-Z]?)\s*\|/.exec(lines[i].trim());
		if (!m) { continue; }
		if (!seen.has(m[1])) { seen.set(m[1], new Set()); }
		seen.get(m[1]).add(m[2].length);
	}
	for (const [prefix, widths] of seen) {
		out[prefix] = widths.size ? Math.min(...widths) : 0;
	}
	return out;
}

/** The single width a roadmap uses, where one is enough. Kept for callers that want a number. */
function detectWidth(text) {
	const widths = Object.values(detectWidths(text));
	return widths.length ? Math.min(...widths) : 0;
}

/**
 * Column widths of an already-aligned table, so regeneration does not reflow the whole file.
 *
 * `format` deliberately leaves tables alone, which means alignment is this renderer's to keep.
 * A register that pads its columns (SX_DW does) would otherwise come back single-spaced on the
 * first run, and the one row that actually changed would be invisible in the diff.
 *
 * Returns null when the source is not aligned, in which case single-spaced is what it already
 * looks like and nothing needs doing.
 */
function detectAlignment(lines, first, headings) {
	// The separator sits directly under the header, above the first data row.
	let sep = null;
	for (let i = first - 1; i >= 0 && i > first - 6; i--) {
		const line = lines[i].trim();
		if (!line.startsWith('|')) { continue; }
		const cells = rowCells(lines[i]).map((c) => c.trim());
		if (cells.length && cells.every((c) => /^:?-{3,}:?$/.test(c))) { sep = cells; }
		break;
	}
	if (!sep || sep.length !== headings.length) { return null; }

	// Three dashes is the minimum marker, which is what an unaligned table writes. Anything
	// wider was padded on purpose, and that width is the column width.
	if (!sep.some((c) => c.length > 3)) { return null; }
	return sep.map((c) => c.length);
}
function padCells(cells, widths) {
	if (!widths) { return cells; }
	return cells.map((c, i) => c.padEnd(widths[i] || 0));
}
/**
 * One table row for one slice document.
 *
 * `state` and `title` come through the synonym map because estates spell them differently
 * (`Slice` here, `Title` there). Every other column is looked up by its slugified header, which is
 * exactly how the migration stored it.
 */
function renderRow(headings, map, data, widths) {
	const cells = headings.map((h, i) => {
		if (i === map.id) { return String(data.id || ''); }
		if (i === map.state) { return escapeCell(data.state || ''); }
		if (i === map.title) { return escapeCell(data.title || ''); }
		const v = data[columnKey(h)];
		return v === undefined || v === null ? '' : escapeCell(String(v));
	});
	return '| ' + padCells(cells, widths).join(' | ') + ' |';
}

/**
 * Sort key: prefix in first-seen order, then number, then suffix.
 *
 * NOT used when rendering. Rows keep the position their author gave them; this exists for a
 * caller that explicitly wants a sorted register.
 */
function ordering(ids) {
	const seen = new Map();
	for (const id of ids) {
		const m = /^([A-Z][A-Z0-9]{0,7})-/.exec(id);
		if (m && !seen.has(m[1])) { seen.set(m[1], seen.size); }
	}
	return (a, b) => {
		const ma = /^([A-Z][A-Z0-9]{0,7})-0*(\d+)([A-Z]?)$/.exec(a.id);
		const mb = /^([A-Z][A-Z0-9]{0,7})-0*(\d+)([A-Z]?)$/.exec(b.id);
		if (!ma || !mb) { return String(a.id).localeCompare(String(b.id)); }
		const pa = seen.has(ma[1]) ? seen.get(ma[1]) : 999;
		const pb = seen.has(mb[1]) ? seen.get(mb[1]) : 999;
		if (pa !== pb) { return pa - pb; }
		if (Number(ma[2]) !== Number(mb[2])) { return Number(ma[2]) - Number(mb[2]); }
		return (ma[3] || '').localeCompare(mb[3] || '');
	};
}

/**
 * Replace the Delivery Index rows of `text` with rows rendered from `records`.
 *
 * Returns `{ text, rendered, unknown, missing, malformed }`. `unknown` are documents whose ID the
 * roadmap does not carry, `missing` are rows no document claims, and `malformed` are rows with more
 * cells than the header has columns. All three are reported rather than acted on, because each is a
 * real finding about the estate and none is safe to fix mechanically.
 */
function renderIndex(text, records) {
	const crlf = text.includes('\r\n');
	const lines = text.split('\r\n').join('\n').split('\n');
	const sec = section(lines, 'Delivery Index');
	if (!sec) {
		return { text, rendered: 0, unknown: records.map((r) => r.id), missing: [], malformed: [], ok: false };
	}

	const headings = indexHeadings(lines);
	if (!headings.length) {
		return { text, rendered: 0, unknown: records.map((r) => r.id), missing: [], malformed: [], ok: false };
	}
	const map = headerMap(headings);

	// Which IDs the table currently carries, and where its row block begins and ends. Only lines
	// that are ID rows are replaced: a note, a blank line or a second table inside the section is
	// left exactly where it was.
	const existing = [];
	const malformed = [];
	let first = -1, last = -1;
	for (let i = sec.start; i < sec.end; i++) {
		const line = lines[i].trim();
		if (!line.startsWith('|')) { continue; }
		const m = /^\|\s*([A-Z][A-Z0-9]{0,7})-(\d+)([A-Z]?)\s*\|/.exec(line);
		if (!m) { continue; }
		const id = `${m[1]}-${Number.parseInt(m[2], 10)}${m[3] || ''}`;
		existing.push(id);
		// More cells than the header has columns means a pipe that was never escaped. Which pipe
		// was meant as text and which as a column is not recoverable, so the row is left alone.
		if (rowCells(lines[i]).length > headings.length) { malformed.push(id); }
		if (first === -1) { first = i; }
		last = i;
	}
	if (first === -1) {
		return { text, rendered: 0, unknown: records.map((r) => r.id), missing: [], malformed: [], ok: false };
	}

	const norm = (id) => {
		const m = /^([A-Z][A-Z0-9]{0,7})-0*(\d+)([A-Z]?)$/.exec(String(id).trim());
		return m ? `${m[1]}-${Number.parseInt(m[2], 10)}${m[3] || ''}` : String(id).trim();
	};

	const have = new Set(existing);
	const byId = new Map(records.map((r) => [norm(r.id), r]));
	const unknown = records.filter((r) => !have.has(norm(r.id))).map((r) => r.id);
	const missing = existing.filter((id) => !byId.has(id));

	const refuse = new Set(malformed);
	const widths = detectAlignment(lines, first, headings);

	// Each row is re-rendered WHERE IT ALREADY SITS. A row nothing claims, and a row refused for
	// having more cells than columns, are copied through byte-for-byte: dropping either would let
	// a half-migrated repo lose commitments, which is worse than a stale row.
	const block = [];
	let count = 0;
	for (let i = first; i <= last; i++) {
		const line = lines[i].trim();
		const m = /^\|\s*([A-Z][A-Z0-9]{0,7})-(\d+)([A-Z]?)\s*\|/.exec(line);
		if (!m) { block.push(lines[i]); continue; }
		const id = `${m[1]}-${Number.parseInt(m[2], 10)}${m[3] || ''}`;
		const rec = byId.get(id);
		if (!rec || refuse.has(id)) { block.push(lines[i]); continue; }
		block.push(renderRow(headings, map, rec, widths));
		count++;
	}
	const rendered = { length: count };

	const out = [...lines.slice(0, first), ...block, ...lines.slice(last + 1)];
	const joined = out.join('\n');
	return {
		text: crlf ? joined.split('\n').join('\r\n') : joined,
		rendered: rendered.length,
		unknown,
		missing,
		malformed,
		ok: true,
	};
}

module.exports = { renderIndex, renderRow, detectWidth, detectWidths, ordering };
