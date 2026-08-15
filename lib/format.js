'use strict';
// Format markdown so a source line is as wide as it renders.
//
// THE PROBLEM. An inline [Klipper](https://github.com/Klipper3d/klipper) costs 45 source columns and
// renders as 7. Wrapping at a fixed width therefore produces lines that END nowhere near where the
// text ends. Reading it feels like the font changed mid-paragraph, because every visual cue says the
// line is full and the words say otherwise.
//
// THE FIX. Long URLs move into reference definitions at the foot of the file, leaving [text][label]
// in the prose - close to the width of the text alone. Then prose is rewrapped. Short relative links
// stay inline, where seeing the target is worth more than the columns it costs.
//
// This never changes a word. It moves URLs and newlines, nothing else.

const fs = require('fs');

const DEFAULTS = {
	width: 100,
	// Below this, an inline link does not meaningfully distort the line.
	urlMin: 26,
	// A long label distorts the line just as the URL did, only less obviously.
	labelMax: 20
};

const INLINE = /(!?)\[([^\]]*)\]\(([^)\s]+)\)/g;
const DEFINITION = /^\[([^\]]+)\]:[ \t]*(\S+)/;

/** A readable label, cut at a word boundary - `powerquery-vscod` is worse than no label at all. */
function makeLabel(text, url, labelMax) {
	let base = text.replace(/`|\*\*|~~/g, '').trim().toLowerCase()
		.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

	if (base.length > labelMax) {
		const kept = [];
		for (const part of base.split('-')) {
			if (kept.length && [...kept, part].join('-').length > labelMax) { break; }
			kept.push(part);
		}
		base = kept.join('-');
	}

	if (!base) {
		const tail = url.split(/[/#?]/).filter(Boolean).pop() || '';
		base = tail.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, labelMax);
	}
	return base || 'link';
}

/** Wrap one prose block, preserving list bullets, task boxes, and their hanging indent. */
function wrapBlock(lines, width) {
	const out = [];
	let para = [], lead = '', hang = '';

	const flush = () => {
		if (!para.length) { return; }
		const words = para.join(' ').split(/\s+/).filter(Boolean);
		let prefix = lead, current = [];

		for (const w of words) {
			const len = prefix.length + current.join(' ').length + (current.length ? 1 : 0) + w.length;
			if (current.length && len > width) {
				out.push(prefix + current.join(' '));
				prefix = hang;
				current = [w];
			} else {
				current.push(w);
			}
		}
		if (current.length) { out.push(prefix + current.join(' ')); }
		para = [];
	};

	for (const line of lines) {
		// A task box counts as part of the bullet, so continuations align under the text.
		const bullet = line.match(/^(\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?)(.*)$/);
		if (bullet) {
			flush();
			lead = bullet[1];
			hang = ' '.repeat(bullet[1].length);
			para.push(bullet[2]);
		} else if (!para.length) {
			lead = hang = (line.match(/^(\s*)/) || ['', ''])[1];
			para.push(line.trim());
		} else {
			para.push(line.trim());
		}
	}
	flush();
	return out;
}

/**
 * Line numbers covered by a MULTI-LINE <!--ewc3:name--> region.
 *
 * Those regions are owned by the values tool, which rebuilds whatever is between the markers - a
 * badge URL cannot contain an HTML comment, so the markers go around the whole line instead. If
 * formatting relocated a reference definition out of such a region, the two tools would undo each
 * other forever, each reporting the file as unformatted.
 *
 * Single-line regions are left out: an inline `<!--ewc3:tests-->111<!--/ewc3:tests-->` is just an
 * unbreakable word in a sentence, and its paragraph should still wrap.
 */
function markedLines(lines) {
	const covered = new Set();
	let start = null, name = null;

	lines.forEach((line, i) => {
		if (start === null) {
			const open = line.match(/<!--ewc3:([a-zA-Z0-9_.-]+)-->/);
			// Only a marker whose region is NOT closed on the same line opens a block.
			if (open && !line.includes(`<!--/ewc3:${open[1]}-->`)) {
				start = i;
				name = open[1];
			}
			return;
		}
		if (line.includes(`<!--/ewc3:${name}-->`)) {
			for (let j = start; j <= i; j++) { covered.add(j); }
			start = null;
			name = null;
		}
	});
	return covered;
}

/** Split into prose (rewrappable) and verbatim (everything else) runs. */
function splitBlocks(lines, protectedLines = new Set()) {
	const blocks = [];
	let buffer = [], fence = null;

	const closeProse = () => {
		if (buffer.length) { blocks.push({ kind: 'prose', lines: buffer }); buffer = []; }
	};

	for (const [i, line] of lines.entries()) {
		const s = line.trimStart();

		if (fence !== null) {
			buffer.push(line);
			if (s.startsWith(fence)) {
				blocks.push({ kind: 'verbatim', lines: buffer });
				buffer = [];
				fence = null;
			}
			continue;
		}
		if (protectedLines.has(i)) {
			closeProse();
			blocks.push({ kind: 'verbatim', lines: [line] });
			continue;
		}
		if (s.startsWith('```') || s.startsWith('~~~')) {
			closeProse();
			fence = s.slice(0, 3);
			buffer = [line];
			continue;
		}
		// Headings, tables, quotes, raw HTML, rules and reference definitions are left exactly alone.
		if (!s || /^(#|\||>|<|---|===)/.test(s) || DEFINITION.test(s)) {
			closeProse();
			blocks.push({ kind: 'verbatim', lines: [line] });
			continue;
		}
		buffer.push(line);
	}
	if (buffer.length) { blocks.push({ kind: fence ? 'verbatim' : 'prose', lines: buffer }); }
	return blocks;
}

/** Format a markdown string. Pure - takes source, returns source. */
function format(source, options = {}) {
	const { width, urlMin, labelMax } = { ...DEFAULTS, ...options };
	const lines = source.split('\n');
	const protectedLines = markedLines(lines);

	// Reuse any definitions already present, so labels stay stable across runs. Definitions inside a
	// marked region belong to the values tool and are neither harvested nor relocated.
	const labelOf = new Map();
	const used = new Set();
	lines.forEach((line, i) => {
		const m = line.match(DEFINITION);
		if (!m) { return; }
		used.add(m[1]);
		if (!protectedLines.has(i)) { labelOf.set(m[2], m[1]); }
	});

	// Move long URLs out of the prose, skipping fenced code.
	const converted = [];
	let fence = null;
	for (const line of lines) {
		const s = line.trimStart();
		if (fence !== null) {
			converted.push(line);
			if (s.startsWith(fence)) { fence = null; }
			continue;
		}
		if (s.startsWith('```') || s.startsWith('~~~')) {
			fence = s.slice(0, 3);
			converted.push(line);
			continue;
		}
		converted.push(line.replace(INLINE, (whole, bang, text, url) => {
			if (bang || url.length < urlMin || url.startsWith('#')) { return whole; }
			if (labelOf.has(url)) { return `[${text}][${labelOf.get(url)}]`; }

			const base = makeLabel(text, url, labelMax);
			let label = base;
			for (let n = 2; used.has(label); n++) { label = `${base}-${n}`; }
			used.add(label);
			labelOf.set(url, label);
			return `[${text}][${label}]`;
		}));
	}

	const rebuilt = [];
	for (const block of splitBlocks(converted, markedLines(converted))) {
		rebuilt.push(...(block.kind === 'prose' ? wrapBlock(block.lines, width) : block.lines));
	}

	// Drop the trailing definition block, then re-emit the full set sorted by label.
	//
	// No `m` flag. With it, `$` matches the end of a LINE rather than the end of the file, so this
	// stripped definition blocks wherever they appeared - including one deliberately parked inside a
	// marked region, which simply vanished.
	let body = rebuilt.join('\n').replace(/\n+$/, '');
	body = body.replace(/\n\n(?:\[[^\]]+\]:[ \t]*\S+[^\n]*(?:\n|$))+$/, '');

	if (labelOf.size) {
		const defs = [...labelOf.entries()].sort((a, b) => a[1].localeCompare(b[1]));
		body += '\n\n' + defs.map(([url, label]) => `[${label}]: ${url}`).join('\n');
	}
	return body + '\n';
}

/** Format files in place, or report which would change. Returns the list that differs. */
function formatFiles(files, { check = false, ...options } = {}) {
	const changed = [];
	for (const file of files) {
		const before = fs.readFileSync(file, 'utf8');
		const after = format(before, options);
		if (before === after) { continue; }
		changed.push(file.replace(/\\/g, '/'));
		if (!check) { fs.writeFileSync(file, after); }
	}
	return changed;
}

module.exports = { format, formatFiles, DEFAULTS };
