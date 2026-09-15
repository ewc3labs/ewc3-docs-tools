'use strict';
// Fenced code: when it opens, and what closes it. ONE grammar for every tool that has to know.
//
// WHY THIS FILE EXISTS. Five places tracked a fence by storing its first three characters and
// closing on any line that started with them - format three times, values once, and a lazy regex in
// links. A document that shows what a fence looks like writes a LONGER fence around a shorter one:
//
//     ````md
//     ```
//     [x]: ../../a.md
//     ```
//     ````
//
// Three characters of ```` are ```, so the INNER line closed the OUTER block, and everything after it
// was treated as live prose: format relocated the definition out of it (the DOCS-061 corruption,
// one level deeper), values substituted an example marker, and links checked an example link. Found
// by Codex on PR #5 in format alone. Fixed once here rather than five times, because five copies of
// one rule had already drifted into five copies of one bug - the lesson DOCS-027 paid for with the
// id grammar.
//
// THE RULE (CommonMark, as far as these tools need it):
//   - a fence opens with 3+ backticks or 3+ tildes, optionally followed by an info string
//   - it closes on a line holding only the SAME character, AT LEAST AS MANY of it, and whitespace
//   - a backtick fence's info string may not contain a backtick (that line is inline code instead)
//   - an unclosed fence runs to the end of the document
//
// Indentation is read the way the callers already read it (leading whitespace ignored), so adopting
// this changes which line closes a fence and nothing else.

/** The opening run (e.g. "````") if this line opens a fence, else null. */
function fenceOpener(line) {
	const m = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
	if (!m) { return null; }
	if (m[1][0] === '`' && m[2].includes('`')) { return null; }
	return m[1];
}

/** Does this line close a fence opened with `opener`? */
function closesFence(line, opener) {
	const m = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
	return Boolean(m && m[1][0] === opener[0] && m[1].length >= opener.length);
}

/**
 * The index of every line inside a fence, delimiters included.
 * An unclosed fence covers the rest of the document.
 */
function fencedLineSet(lines) {
	const inside = new Set();
	let opener = null;
	lines.forEach((line, i) => {
		if (opener !== null) {
			inside.add(i);
			if (closesFence(line, opener)) { opener = null; }
			return;
		}
		const o = fenceOpener(line);
		if (o) { opener = o; inside.add(i); }
	});
	return inside;
}

/** The text with every fenced block's lines blanked, keeping line count and positions. */
function blankFences(text) {
	const lines = text.split('\n');
	const inside = fencedLineSet(lines);
	return lines.map((l, i) => (inside.has(i) ? '' : l)).join('\n');
}

module.exports = { fenceOpener, closesFence, fencedLineSet, blankFences };
