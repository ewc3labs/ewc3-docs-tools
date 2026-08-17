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
/**
 * Tokens that would start a new block if a wrap put them in column one: list bullets, ordered-list
 * numbers, headings, blockquotes, and table pipes.
 */
const STARTS_A_BLOCK = /^(?:[-*+>#|]+|\d+\.)$/;

// A token that must never be wrapped into column one because the line would REPARSE there.
// `<` is the one that bites: an HTML comment is a CommonMark type-2 HTML block and is allowed
// to interrupt a paragraph, so a wrapped `<!--...-->` stops being prose. Worse, the block
// splitter then treats that line as verbatim forever - the formatter is stable on the broken
// state and cannot undo its own damage. The only fix is not to create it.
const REPARSES_AT_COLUMN_ONE = /^[<#|>]/;
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

// A wrappable token. An inline code span is ONE token even though it contains spaces.
//
// NOT because it would render wrong - verified against GitHub, a span split across lines still
// renders as one <code> element, since CommonMark converts the line ending to a space. The reason
// is that THIS TOOLKIT'S OWN SCANNERS ARE LINE-BASED: format's marker detection, the link checker,
// and the values scanner all strip code spans one line at a time. A split span defeats all three at
// once, so its contents get treated as live markup. That is how it surfaced - a `(img)` inside a
// documentation example became a link the checker went looking for.
//
// The trailing bare-backtick alternative keeps an unmatched backtick from being dropped.
const WORD_OR_CODE_SPAN = /(?:[^\s`]|`[^`\n]*`|`)+/g;

/** Wrap one prose block, preserving list bullets, task boxes, and their hanging indent. */
function wrapBlock(lines, width) {
	const out = [];
	let para = [], lead = '', hang = '';

	const flush = () => {
		if (!para.length) { return; }
		const words = para.join(' ').match(WORD_OR_CODE_SPAN) || [];
		let prefix = lead, current = [];

		for (const w of words) {
			const len = prefix.length + current.join(' ').length + (current.length ? 1 : 0) + w.length;
			// Never let a wrap put a markdown-significant token at the start of a line. A dash used as
			// punctuation mid-sentence becomes a NESTED LIST ITEM when it lands in column one, which
			// silently restructures the document - the words are identical and the meaning is not.
			if (current.length && len > width && !STARTS_A_BLOCK.test(w) && !REPARSES_AT_COLUMN_ONE.test(w)) {
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
	let start = null, name = null, fence = null;

	lines.forEach((line, i) => {
		const s = line.trimStart();

		// A marker written INSIDE code is documentation about the syntax, not the syntax. Without
		// this, a row like "| Refresh values between `<!--ewc3:name-->` markers |" opens a block that
		// never closes, and every real marked region after it silently stops being protected.
		if (fence !== null) {
			if (s.startsWith(fence)) { fence = null; }
			return;
		}
		if (s.startsWith('```') || s.startsWith('~~~')) {
			fence = s.slice(0, 3);
			return;
		}
		const bare = line.replace(/`[^`\n]*`/g, '');

		if (start === null) {
			const open = bare.match(/<!--ewc3:([a-zA-Z0-9_.-]+)-->/);
			// Only a marker whose region is NOT closed on the same line opens a block.
			if (open && !bare.includes(`<!--/ewc3:${open[1]}-->`)) {
				start = i;
				name = open[1];
			}
			return;
		}
		if (bare.includes(`<!--/ewc3:${name}-->`)) {
			for (let j = start; j <= i; j++) { covered.add(j); }
			start = null;
			name = null;
		}
	});
	// An unterminated marker protects nothing - better to reformat a region than to silently stop
	// protecting every region after it.
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

			// LEAVE THE BADGE IDIOM ALONE: [![alt](image-url)](link-url).
			//
			// This scan is not a markdown parser. Given that construct it matches the OUTER bracket
			// with `![alt` as the link text, so it rewrites the IMAGE url into a reference and emits
			// [![alt][label]](link-url). That is still valid markdown - GitHub renders it - but it is
			// not what was written, and reference-style images do not survive every renderer. A
			// README's badge row is exactly where this shows up, and exactly where being wrong is
			// most visible. Anything with a nested bracket or image is left untouched.
			if (text.startsWith('!') || text.includes('[')) { return whole; }
			if (labelOf.has(url)) { return `[${text}][${labelOf.get(url)}]`; }

			const base = makeLabel(text, url, labelMax);
			let label = base;
			for (let n = 2; used.has(label); n++) { label = `${base}-${n}`; }
			used.add(label);
			labelOf.set(url, label);
			return `[${text}][${label}]`;
		}));
	}

	// Remove every harvested definition WHEREVER it sits, not just the block at the foot.
	//
	// Stripping only the trailing block was a duplication bug: definitions appearing in more than one
	// place - which happens as soon as anything appends a second block - were harvested into labelOf,
	// left in place, and then emitted again at the foot. Every run added another copy.
	//
	// Definitions inside a marked region belong to the values tool and stay exactly where they are.
	const protectedAfter = markedLines(converted);
	const kept = converted.filter((line, i) => protectedAfter.has(i) || !DEFINITION.test(line));
	const keptProtected = markedLines(kept);

	const rebuilt = [];
	for (const block of splitBlocks(kept, keptProtected)) {
		rebuilt.push(...(block.kind === 'prose' ? wrapBlock(block.lines, width) : block.lines));
	}

	// Removing definitions mid-document can leave a run of blank lines behind.
	let body = rebuilt.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '');

	if (labelOf.size) {
		const defs = [...labelOf.entries()].sort((a, b) => a[1].localeCompare(b[1]));
		body += '\n\n' + defs.map(([url, label]) => `[${label}]: ${url}`).join('\n');
	}
	return body + '\n';
}

/** Format files in place, or report which would change. Returns the list that differs. */
/**
 * CRLF IS NORMALIZED BEFORE FORMATTING AND RESTORED AFTER.
 *
 * Without this the formatter never converges on a CRLF file. Rewrapped prose loses its carriage
 * returns - a CR is whitespace, so the tokenizer drops it - while verbatim lines (headings, tables,
 * fences) keep theirs. Every pass changes a few more lines and the file is never "formatted", so
 * `fix` followed by `check` FAILS - precisely the workflow this toolkit tells people to adopt.
 * Measured on a real file: 49 carriage returns, falling by three per pass.
 *
 * The file's existing ending is put back rather than forced to LF. A documentation formatter that
 * silently rewrites every line ending in a repository is not what anyone asked for; that belongs to
 * `.gitattributes`, at commit time, where it can be reviewed.
 */
function formatFiles(files, { check = false, ...options } = {}) {
	const changed = [];
	for (const file of files) {
		const raw = fs.readFileSync(file, 'utf8');
		const crlf = raw.includes('\r\n');
		const before = crlf ? raw.split('\r\n').join('\n') : raw;
		const formatted = format(before, options);
		const after = crlf ? formatted.split('\n').join('\r\n') : formatted;
		if (raw === after) { continue; }
		changed.push(file.replace(/\\/g, '/'));
		if (!check) { fs.writeFileSync(file, after); }
	}
	return changed;
}

module.exports = { format, formatFiles, DEFAULTS };
