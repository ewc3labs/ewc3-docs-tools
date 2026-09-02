'use strict';

/**
 * Frontmatter: the one place a slice or module document declares anything.
 *
 * A RESTRICTED YAML SUBSET, parsed here rather than by a dependency. `package.json` has no
 * `dependencies` key at all and that is load-bearing - the toolkit's selling point is `npx` and go,
 * and the config is JSON rather than YAML for exactly this reason.
 *
 * Supported, and this is the whole grammar:
 *
 *     key: scalar            a string, trimmed; quotes stripped if they wrap the whole value
 *     key: [a, b]            inline list
 *     key:                   block list
 *       - a
 *       - b
 *     key:                   empty value -> null
 *     # comment              whole-line, and ` #` to end of line
 *
 * NOT supported, deliberately: nesting, anchors, multi-line scalars, type coercion. A document
 * needing more than this is doing too much, so REFUSING IT IS A FEATURE - `parse` throws rather
 * than guessing, because the lesson of this toolkit's worst week was that a guess is not a check.
 */

const FENCE = '---';

/** Strip a trailing ` # comment`, which YAML requires be preceded by whitespace. */
function stripComment(s) {
	let quote = null;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (quote) {
			if (c === quote) { quote = null; }
			continue;
		}
		if (c === '"' || c === "'") { quote = c; continue; }
		if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) { return s.slice(0, i); }
	}
	return s;
}

function scalar(raw) {
	const s = stripComment(raw).trim();
	if (!s) { return null; }
	if ((s.startsWith('"') && s.endsWith('"') && s.length > 1)
		|| (s.startsWith("'") && s.endsWith("'") && s.length > 1)) {
		return s.slice(1, -1);
	}
	return s;
}

function inlineList(raw) {
	const inner = raw.trim().slice(1, -1).trim();
	if (!inner) { return []; }
	return inner.split(',').map((p) => scalar(p)).filter((v) => v !== null);
}

/**
 * Parse the restricted subset. Throws on anything outside it, naming the line.
 */
function parse(text) {
	const out = {};
	const lines = text.split('\n');
	let key = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].replace(/\r$/, '');
		if (!line.trim() || /^\s*#/.test(line)) { continue; }

		const item = /^\s+-\s*(.*)$/.exec(line);
		if (item) {
			if (key === null || !Array.isArray(out[key])) {
				throw new Error(`frontmatter line ${i + 1}: list item with no list to belong to`);
			}
			const v = scalar(item[1]);
			if (v !== null) { out[key].push(v); }
			continue;
		}

		if (/^\s+\S/.test(line)) {
			throw new Error(`frontmatter line ${i + 1}: nested keys are not supported - keep it flat`);
		}

		const kv = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:(.*)$/.exec(line);
		if (!kv) {
			throw new Error(`frontmatter line ${i + 1}: not \`key: value\` - ${JSON.stringify(line)}`);
		}

		key = kv[1];
		const rest = kv[2];
		const trimmed = stripComment(rest).trim();

		if (trimmed === '|' || trimmed === '>' || trimmed.startsWith('&') || trimmed.startsWith('*')) {
			throw new Error(`frontmatter line ${i + 1}: block scalars and anchors are not supported`);
		}

		if (trimmed.startsWith('[') && trimmed.endsWith(']')) { out[key] = inlineList(trimmed); continue; }
		if (trimmed === '') {
			// Either an empty value or the head of a block list; the next line decides.
			const next = (lines[i + 1] || '').replace(/\r$/, '');
			out[key] = /^\s+-\s/.test(next) ? [] : null;
			continue;
		}
		out[key] = scalar(rest);
	}

	return out;
}

/**
 * Split a document into its frontmatter block and the body after it.
 *
 * Returns `{ data, body, had }`. `had` is false when the document has no frontmatter at all, which
 * is not an error - most documents are not slice documents.
 */
function read(text) {
	const norm = text.split('\r\n').join('\n');
	if (!norm.startsWith(FENCE + '\n')) { return { data: {}, body: text, had: false }; }

	const end = norm.indexOf('\n' + FENCE, FENCE.length);
	if (end === -1) { throw new Error('frontmatter opened with --- and never closed'); }

	const block = norm.slice(FENCE.length + 1, end);
	// Strip the blank separator symmetrically with what `write` re-adds, so a read/write
	// round-trip on an unchanged document is byte-identical.
	const after = norm.slice(end + 1 + FENCE.length).replace(/^\n+/, '');
	return { data: parse(block), body: after, had: true };
}

/** Render values back out. Order is the caller's; a Map or plain object both work. */
function stringify(data) {
	const lines = [];
	for (const [k, v] of (data instanceof Map ? data : Object.entries(data))) {
		if (v === null || v === undefined || v === '') { lines.push(`${k}:`); continue; }
		if (Array.isArray(v)) {
			lines.push(v.length ? `${k}: [${v.join(', ')}]` : `${k}: []`);
			continue;
		}
		lines.push(`${k}: ${v}`);
	}
	return lines.join('\n');
}

/**
 * Write frontmatter back, preserving the body byte-for-byte and the document's line endings.
 *
 * Idempotent by construction: `write(t, read(t).data)` differs from `t` only where a value changed.
 */
function write(text, data) {
	const crlf = text.includes('\r\n');
	const { body } = read(text);
	const out = FENCE + '\n' + stringify(data) + '\n' + FENCE + '\n\n' + body.replace(/^\n+/, '');
	return crlf ? out.split('\n').join('\r\n') : out;
}

module.exports = { parse, read, write, stringify };
