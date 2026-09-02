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
 *     key: scalar            a string, trimmed; quotes stripped, escapes decoded
 *     key: [a, b]            inline list; a comma inside a quoted element stays in the element
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
			if (c === '\\' && quote === '"') { i++; continue; }
			if (c === quote) { quote = null; }
			continue;
		}
		if (c === '"' || c === "'") { quote = c; continue; }
		if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) { return s.slice(0, i); }
	}
	return s;
}

/**
 * Decode a quoted scalar, or return null when the text is not quoted.
 *
 * Double quotes carry `\\` and `\"`; single quotes carry `''`. This MUST be the exact inverse of
 * `quoted()` below, because `write` is a fold rewriting frontmatter it did not author - and a
 * serialisation the reader cannot undo corrupts a title while updating a state.
 */
function unquote(s) {
	if (s.length > 1 && s.startsWith('"') && s.endsWith('"')) {
		return s.slice(1, -1).replace(/\\(["\\])/g, '$1');
	}
	if (s.length > 1 && s.startsWith("'") && s.endsWith("'")) {
		return s.slice(1, -1).replace(/''/g, "'");
	}
	return null;
}

/** The exact inverse of `unquote`'s double-quoted branch. */
function quoted(v) {
	return '"' + String(v).replace(/[\\"]/g, (m) => '\\' + m) + '"';
}

/**
 * The trailing ` # comment` of a line, or '' - the exact remainder `stripComment` discards.
 *
 * A comment like `state: planned   # the human judgement` describes the FIELD, not the value, so
 * dropping it when the value changes loses the annotation permanently. Quote-aware, because a `#`
 * inside a quoted title is not a comment.
 */
function trailingComment(line) {
	const kept = stripComment(line);
	if (kept.length === line.length) { return ''; }
	// Include the whitespace that separated the value from the comment, or they collide.
	return line.slice(kept.replace(/\s+$/, '').length);
}

function scalar(raw) {
	const s = stripComment(raw).trim();
	if (!s) { return null; }
	const un = unquote(s);
	return un === null ? s : un;
}

/** Split on commas OUTSIDE quotes, so a list element may contain one. */
function splitTop(inner) {
	const out = [];
	let buf = '';
	let quoteChar = null;
	for (let i = 0; i < inner.length; i++) {
		const c = inner[i];
		if (quoteChar) {
			buf += c;
			if (c === '\\' && quoteChar === '"') { buf += inner[++i] || ''; continue; }
			if (c === quoteChar) { quoteChar = null; }
			continue;
		}
		if (c === '"' || c === "'") { quoteChar = c; buf += c; continue; }
		if (c === ',') { out.push(buf); buf = ''; continue; }
		buf += c;
	}
	out.push(buf);
	return out;
}

function inlineList(raw) {
	const inner = raw.trim().slice(1, -1).trim();
	if (!inner) { return []; }
	return splitTop(inner).map((p) => scalar(p)).filter((v) => v !== null);
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
			// Either an empty value or the head of a block list. Look PAST comments and blank lines
			// to decide - both are part of the advertised subset, and examining only the immediate
			// next line classified `depends_on:` followed by `# waiting on API` as null, after
			// which the item beneath threw "list item with no list to belong to".
			let j = i + 1;
			while (j < lines.length) {
				const peek = lines[j].replace(/\r$/, '');
				if (!peek.trim() || /^\s*#/.test(peek)) { j++; continue; }
				break;
			}
			const next = (lines[j] || '').replace(/\r$/, '');
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
	const lines = norm.split('\n');
	if (lines[0] !== FENCE) { return { data: {}, body: text, had: false }; }

	// A COMPLETE line, not a prefix. Searching for the first `\n---` matched `---not-a-fence`,
	// closed the block early, and dropped the fields beneath it into the body - where a rewrite
	// then re-fenced them in the wrong place. Scan lines and require an exact delimiter.
	let closeAt = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trimEnd() === FENCE) { closeAt = i; break; }
	}
	if (closeAt === -1) { throw new Error('frontmatter opened with --- and never closed'); }

	// The body is every line after the closing fence, joined back verbatim - so an unchanged
	// rewrite is byte-identical, blank lines included.
	const block = lines.slice(1, closeAt).join('\n');
	const body = lines.slice(closeAt + 1).join('\n');
	return { data: parse(block), body, had: true, block };
}

/**
 * Serialise ONE field, choosing quoting by round-tripping through `parse` ITSELF.
 *
 * An earlier version tested candidates against `scalar()` alone and called that "the round-trip", so
 * the rule could not drift from the parser. It could, because `scalar` is not the parser. Codex
 * found three ways past it in one round, all parse-level behaviour `scalar` never sees:
 *
 *     title: "*important"    written plain, re-read, THREW as an anchor
 *     title: "[draft]"       written plain, silently retyped as a one-element LIST
 *     tags: [alpha,beta]     one element, re-read as two - a cardinality change
 *
 * So the invariant is now checked where it actually lives. This matters more than it looks: `write`
 * is a fold rewriting frontmatter it did not author, and every one of those failures corrupts a
 * field nobody was editing.
 *
 * If no candidate survives, REFUSE. A value this subset cannot represent is a document doing too
 * much, and silently mangling it is the one outcome worse than failing.
 */
function field(k, v) {
	// ONLY null/undefined take the bare `key:` form. An explicit `title: ""` is a STRING, and
	// emitting it as `title:` re-parses as null - an unrelated fold changing a field's TYPE.
	const empty = v === null || v === undefined;
	const candidates = empty
		? [`${k}:`]
		: Array.isArray(v)
			? [`${k}: [${v.map(String).join(', ')}]`, `${k}: [${v.map(quoted).join(', ')}]`]
			: [`${k}: ${v}`, `${k}: ${quoted(v)}`];

	const want = JSON.stringify(empty ? null : v);
	for (const line of candidates) {
		try {
			const back = parse(line)[k];
			if (JSON.stringify(back === undefined ? null : back) === want) { return line; }
		} catch { /* try the next candidate */ }
	}
	throw new Error(`frontmatter: cannot represent ${k} = ${JSON.stringify(v)} in the supported subset`);
}

/** Render values back out. Order is the caller's; a Map or plain object both work. */
function stringify(data) {
	const entries = data instanceof Map ? [...data] : Object.entries(data);
	return entries.map(([k, v]) => field(k, v)).join('\n');
}

/**
 * Rewrite a frontmatter block by PATCHING it, not regenerating it.
 *
 * Comment lines, blank lines and the order of fields are the author's, and a fold that changes
 * `state` has no business deleting them. An earlier version rebuilt the block from key/value pairs
 * alone, so a state-only fold silently stripped every explanatory comment in the document.
 *
 * An unchanged field is re-emitted VERBATIM - which also preserves its trailing comment. A changed
 * field is re-serialised, and loses its trailing comment, which is honest: the comment described the
 * old value.
 */
function patch(block, data) {
	const lines = block.split('\n');
	const out = [];
	const seen = new Set();

	for (let i = 0; i < lines.length; i++) {
		const kv = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:/.exec(lines[i]);
		if (!kv) { out.push(lines[i]); continue; }

		// Gather this field's WHOLE region: its own line, its block-list items, and any comments or
		// blank lines INTERLEAVED between those items.
		//
		// Stopping at the first non-item line truncated the region, so changing a list emitted the
		// new value and LEFT THE LATER ITEMS IN PLACE - `[a, b]` set to `[x]` read back as
		// `[x, b]`. A removed dependency survived the fold, which is the exact failure a dependency
		// graph cannot tolerate.
		//
		// Trailing comments and blanks AFTER the last item belong to the gap, not the field, so the
		// region ends at the last list item actually seen.
		const start = i;
		let lastItem = i;
		for (let j = i + 1; j < lines.length; j++) {
			if (/^\s+-\s/.test(lines[j])) { lastItem = j; continue; }
			if (/^\s*(#|$)/.test(lines[j])) { continue; }
			break;
		}
		i = lastItem;
		const original = lines.slice(start, i + 1);

		const key = kv[1];
		seen.add(key);
		if (!(key in data)) { continue; }

		const was = parse(original.join('\n'))[key];
		const now = data[key];
		const unchanged = JSON.stringify(was === undefined ? null : was)
			=== JSON.stringify(now === undefined ? null : now);

		if (unchanged) {
			out.push(...original);
		} else {
			// Carry the field's trailing comment across the change - it annotates the field.
			const note = original.length === 1 ? trailingComment(original[0]) : '';
			out.push(field(key, now) + note);
		}
	}

	for (const [k, v] of (data instanceof Map ? [...data] : Object.entries(data))) {
		if (!seen.has(k)) { out.push(field(k, v)); }
	}

	return out.join('\n');
}

/**
 * Write frontmatter back, preserving the body byte-for-byte and the document's line endings.
 *
 * Idempotent by construction: `write(t, read(t).data)` is byte-identical to `t`.
 */
function write(text, data) {
	const crlf = text.includes('\r\n');
	const { body, block, had } = read(text);
	const rendered = had ? patch(block, data) : stringify(data);
	const out = FENCE + '\n' + rendered + '\n' + FENCE + '\n' + (had ? body : '\n' + body);
	return crlf ? out.split('\n').join('\r\n') : out;
}

module.exports = { parse, read, write, stringify, field, patch };
