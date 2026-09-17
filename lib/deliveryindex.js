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
	section, rowCells, headerMap, columnKey, escapeCell, indexHeadings, idPattern,
} = require('./slices.js');
const { fencedLineSet } = require('./fence.js');

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
		const m = idPattern('^\\|\\s*', '\\s*\\|', '').exec(lines[i].trim());
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
		const ma = idPattern('^', '$', '').exec(a.id);
		const mb = idPattern('^', '$', '').exec(b.id);
		if (!ma || !mb) { return String(a.id).localeCompare(String(b.id)); }
		const pa = seen.has(ma[1]) ? seen.get(ma[1]) : 999;
		const pb = seen.has(mb[1]) ? seen.get(mb[1]) : 999;
		if (pa !== pb) { return pa - pb; }
		if (Number(ma[2]) !== Number(mb[2])) { return Number(ma[2]) - Number(mb[2]); }
		return (ma[3] || '').localeCompare(mb[3] || '');
	};
}

/**
 * A row's cells as GitHub would render them - and not one normalisation further. DOCS-056.
 *
 * GFM trims SPACES AND TABS at a cell's edges and turns `\|` into a pipe. That is exactly what this
 * does, so a padding-only difference can never read as a hand edit, which is what decouples the gate
 * from `format` and `index` disagreeing about column padding (DOCS-059).
 *
 * Deliberately NOT `String.prototype.trim`, which also strips a no-break space and a stray `\r`, and
 * deliberately no NFC or variation-selector folding. GFM does not ignore those, so the rendered page
 * differs and the rows must too. Every extra normalisation is a place a real change can hide
 * (LabsHQ finding 7) - `⏸` with and without U+FE0F already broke one migration.
 *
 * Padded with empty cells to `columns`, because a row with no trailing pipe and an empty last cell
 * has one fewer raw cell than the same row written with one, and GFM renders them identically.
 *
 * With `defs` (from `referenceDefs`), a reference link is resolved to the inline link it renders as.
 * `index` writes `[DOCS-001](slices/...)` and `format` rewrites it to `[DOCS-001][docs-001]` plus a
 * definition; unresolved, every row of every formatted register read as diverged - all 43 of this
 * repository's. This is not a normalisation that can hide a change: a definition pointing anywhere
 * else resolves to a different link.
 */
function gfmCells(line, columns = 0, defs = null) {
	const cells = rowCells(line).map((c) => resolveReferences(
		c.replace(/^[ \t]+|[ \t]+$/g, '').split('\\|').join('|'), defs));
	while (cells.length < columns) { cells.push(''); }
	return cells;
}

/** A link label as CommonMark matches it: case-insensitive, inner whitespace collapsed. */
const linkLabel = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Reference definitions in a document: label -> `target` or `target "title"`. First one wins, as in
 * CommonMark. A definition inside a fence defines nothing, and an AMBIGUOUS fence counts as a fence:
 * for a gate, trusting a doubtful definition could make a changed cell look equal, while distrusting
 * it can only make an equal cell look changed - which is loud.
 */
function referenceDefs(text) {
	const lines = text.split('\r\n').join('\n').split('\n');
	const fenced = fencedLineSet(lines, { ambiguous: 'fenced' });
	const html = htmlBlockLines(lines, fenced);
	const defs = new Map();
	lines.forEach((line, i) => {
		if (fenced.has(i) || html.has(i)) { return; }
		const m = /^ {0,3}\[((?:[^\]\\]|\\.)+)\]:[ \t]*(<[^>]*>|\S+)(.*)$/.exec(line);
		if (!m) { return; }
		const key = linkLabel(m[1]);
		const title = m[3].replace(/[ \t]+$/, '');
		if (!defs.has(key)) { defs.set(key, m[2].replace(/^<([^>]*)>$/, '$1') + title); }
	});
	return defs;
}

const HTML_BLOCK_TAGS = 'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|'
	+ 'dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|'
	+ 'iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|'
	+ 'table|tbody|td|tfoot|th|thead|title|tr|track|ul';

/**
 * Lines inside a CommonMark raw HTML block, where a `[label]: target` line defines nothing (Codex, PR #6).
 *
 * The seven block kinds by their start and end conditions: script/pre/style/textarea, a comment,
 * `<?`, `<!X` and CDATA each end at their closing marker; a known block tag, or a line that is a lone
 * complete tag, ends at a blank line. One simplification, in the safe direction: the lone-tag kind
 * cannot interrupt a paragraph, and this does not check. Over-excluding a real definition makes an
 * equal cell read as changed - loud - and never the reverse.
 */
function htmlBlockLines(lines, fenced) {
	const inside = new Set();
	let end = null;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		// Inside an HTML block, fences are not recognised, so the block's own terminator decides - checked
		// BEFORE the fence set. Clearing the block on a fence-looking line leaked a commented definition
		// that sat after a backtick pair inside `<!-- -->` (Codex, PR #6 second pass). The converse, a
		// fence opener inside HTML that fence.js believes, can only over-exclude, which is loud.
		if (!end && fenced.has(i)) { continue; }
		if (end) {
			if (end === 'blank') {
				if (!line.trim()) { end = null; continue; }
				inside.add(i);
			} else {
				inside.add(i);
				if (end.test(line)) { end = null; }
			}
			continue;
		}
		const m = /^ {0,3}(<.*)$/.exec(line);
		if (!m) { continue; }
		const t = m[1];
		const kinds = [
			[/^<(script|pre|style|textarea)(\s|>|$)/i, /<\/(script|pre|style|textarea)>/i, 1],
			[/^<!--/, /-->/, 4],
			[/^<\?/, /\?>/, 2],
			[/^<!\[CDATA\[/, /\]\]>/, 9],
			[/^<![A-Za-z]/, />/, 2],
			[new RegExp(`^</?(${HTML_BLOCK_TAGS})(\\s|/?>|$)`, 'i'), 'blank'],
			[/^(<[A-Za-z][A-Za-z0-9-]*(\s+[A-Za-z_:][\w.:-]*(\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>|<\/[A-Za-z][A-Za-z0-9-]*\s*>)\s*$/, 'blank'],
		];
		const kind = kinds.find(([start]) => start.test(t));
		if (!kind) { continue; }
		inside.add(i);
		const [, close, skip] = kind;
		// A block that closes on its own opening line is one line long.
		if (close === 'blank' || !close.test(t.slice(skip))) { end = close; }
	}
	return inside;
}

/** `[text][label]`, `[label][]` and `[label]` rewritten as the `[text](target)` they render as. */
function resolveReferences(cell, defs) {
	if (!defs || !defs.size || !cell.includes('[')) { return cell; }
	// Code spans are literal text; the odd-numbered parts of this split are the spans.
	return cell.split(/(`+[^`]*`+)/).map((part, i) => (i % 2 ? part : part.replace(
		/\[((?:[^\][\\]|\\.)*)\](?:\[((?:[^\][\\]|\\.)*)\])?(?![(:])/g,
		(whole, text, ref) => {
			const def = defs.get(linkLabel(ref ? ref : text));
			return def === undefined ? whole : `[${text}](${def})`;
		}))).join('');
}

/** Every id row in a text's Delivery Index section, in order: `[{ id, line, raw }]`. Duplicates kept. */
function indexRows(text) {
	const lines = text.split('\r\n').join('\n').split('\n');
	const sec = section(lines, 'Delivery Index');
	const out = [];
	if (!sec) { return out; }
	for (let i = sec.start; i < sec.end; i++) {
		const line = lines[i].trim();
		if (!line.startsWith('|')) { continue; }
		const m = idPattern('^\\|\\s*', '\\s*\\|', '').exec(line);
		if (!m) { continue; }
		out.push({ id: `${m[1]}-${Number.parseInt(m[2], 10)}${m[3] || ''}`, line: i, raw: lines[i] });
	}
	return out;
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
		const m = idPattern('^\\|\\s*', '\\s*\\|', '').exec(line);
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
		const m = idPattern('^', '$', '').exec(String(id).trim());
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
	// Every id row, what it held, and what it renders to (null when nothing claims it or it was
	// refused). DOCS-056 compares these; rendering itself does not need them.
	const rows = [];
	let count = 0;
	for (let i = first; i <= last; i++) {
		const line = lines[i].trim();
		const m = idPattern('^\\|\\s*', '\\s*\\|', '').exec(line);
		if (!m) { block.push(lines[i]); continue; }
		const id = `${m[1]}-${Number.parseInt(m[2], 10)}${m[3] || ''}`;
		const rec = byId.get(id);
		if (!rec || refuse.has(id)) {
			block.push(lines[i]);
			rows.push({ id, line: i, raw: lines[i], rendered: null });
			continue;
		}
		const rendered = renderRow(headings, map, rec, widths);
		block.push(rendered);
		rows.push({ id, line: i, raw: lines[i], rendered });
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
		rows,
		columns: headings.length,
		ok: true,
	};
}

module.exports = {
	renderIndex, renderRow, detectWidth, detectWidths, ordering, gfmCells, indexRows, referenceDefs,
};
