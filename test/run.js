'use strict';
// Tests. No framework - node test/run.js.
//
// The property that matters most for `format` is that it NEVER CHANGES A WORD. Everything else is
// cosmetic; that one is a correctness guarantee, so it is asserted directly by comparing word
// streams before and after.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { format } = require('../lib/format');
const { checkLinks } = require('../lib/links');
const { applyToText, resolveValues } = require('../lib/values');

let passed = 0, failed = 0;

function test(name, fn) {
	try {
		fn();
		passed++;
		console.log(`  ok    ${name}`);
	} catch (err) {
		failed++;
		console.log(`  FAIL  ${name}`);
		console.log(`        ${err.message}`);
	}
}

/** Collapse a document to the words a reader would see, links resolved. */
function words(markdown) {
	const defs = new Map();
	for (const m of markdown.matchAll(/^\[([^\]]+)\]:[ \t]*(\S+)/gm)) {
		defs.set(m[1].toLowerCase(), m[2]);
	}
	return markdown
		.replace(/^\[[^\]]+\]:[ \t]*\S+.*$/gm, '')
		.replace(/\[([^\]]*)\]\[([^\]]*)\]/g, (w, text, label) =>
			`[${text}](${defs.get((label || text).toLowerCase()) || '?'})`)
		.split(/\s+/).filter(Boolean);
}

function tmpdir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'ewc3-docs-'));
}

// --- format ----------------------------------------------------------------

console.log('\nformat');

test('moves a long URL into a reference definition', () => {
	const out = format('See [Klipper](https://github.com/Klipper3d/klipper) for details.\n');
	assert.match(out, /\[Klipper\]\[klipper\]/);
	assert.match(out, /^\[klipper\]: https:\/\/github\.com\/Klipper3d\/klipper$/m);
});

test('leaves a short relative link inline', () => {
	const out = format('See [Commands](Commands.md) for details.\n');
	assert.match(out, /\[Commands\]\(Commands\.md\)/);
});

test('never changes a word', () => {
	const src = [
		'# Title', '',
		'Some prose with [a link](https://example.com/a/very/long/path/indeed) inside it that runs on',
		'well past the wrap column and keeps going for a while longer still.', '',
		'- a bullet with [another](https://example.com/another/long/one) in it that also runs long',
		'  and continues here', '',
		'| a | b |', '| --- | --- |', '| 1 | 2 |', ''
	].join('\n');
	assert.deepStrictEqual(words(format(src)), words(src));
});

test('is idempotent', () => {
	const src = 'Text with [a link](https://example.com/some/quite/long/path) in it.\n';
	const once = format(src);
	assert.strictEqual(format(once), once);
});

test('does not touch fenced code', () => {
	const src = '```js\nconst x = "[a](https://example.com/very/long/url/here)";\n```\n';
	assert.strictEqual(format(src), src);
});

test('does not wrap tables', () => {
	const row = '| a very long cell | another very long cell | a third one that pushes past 100 columns |';
	assert.ok(format(`${row}\n`).includes(row));
});

test('preserves hanging indent under a task box', () => {
	const src = '- [ ] a task item whose text is long enough that it genuinely has to wrap somewhere past the hundred column limit set by default\n';
	const out = format(src).split('\n');
	assert.strictEqual(out.length > 1, true, 'should wrap');
	assert.match(out[1], /^ {6}\S/, `continuation should align under the text, got ${JSON.stringify(out[1])}`);
});

test('reuses an existing label rather than inventing a second', () => {
	const src = 'One [x](https://example.com/aaaaaaaaaaaaaaaaaaaa) and two [y](https://example.com/aaaaaaaaaaaaaaaaaaaa).\n';
	const out = format(src);
	assert.strictEqual((out.match(/^\[[^\]]+\]: /gm) || []).length, 1);
});

test('leaves a reference definition inside an ewc3 marker where it is', () => {
	// The two tools must not fight: values owns whatever is between markers, so format must not
	// harvest a definition out of that region and relocate it to the foot of the file.
	const src = [
		'Some prose here.', '',
		'<!--ewc3:badgeTests-->',
		'[tests]: https://img.shields.io/badge/tests-111-brightgreen.svg',
		'<!--/ewc3:badgeTests-->', ''
	].join('\n');
	const out = format(src);
	assert.ok(out.includes('<!--ewc3:badgeTests-->\n[tests]: https://img.shields.io/badge/tests-111-brightgreen.svg\n<!--/ewc3:badgeTests-->'),
		`definition was moved out of its markers:\n${out}`);
	assert.strictEqual(format(out), out, 'must be idempotent');
});

test('still wraps a paragraph containing an inline marker', () => {
	const src = 'Quality gates: ESLint, TypeScript, <!--ewc3:tests-->111<!--/ewc3:tests--> tests, and a good deal more prose to push this past the wrap column.\n';
	const out = format(src);
	assert.ok(out.split('\n').length > 2, 'should wrap');
	assert.ok(out.includes('<!--ewc3:tests-->111<!--/ewc3:tests-->'), 'marker must survive intact');
});

test('never duplicates a definition, however many blocks there were', () => {
	// Stripping only the trailing block meant an earlier block was harvested, left in place, and
	// emitted again at the foot - so every run added another copy.
	const src = [
		'Text with [a link](https://example.com/some/quite/long/path).', '',
		'[stray]: https://example.com/stray', '',
		'[other]: https://example.com/other', ''
	].join('\n');
	const once = format(src);
	const count = label => (once.match(new RegExp('^\\[' + label + '\\]: ', 'gm')) || []).length;

	assert.strictEqual(count('stray'), 1, `stray duplicated:\n${once}`);
	assert.strictEqual(count('other'), 1, `other duplicated:\n${once}`);
	assert.strictEqual(format(once), once, 'must be idempotent');
});

test('a marker inside a code span is documentation, not a marker', () => {
	// Writing about the syntax used to break the syntax: a table row mentioning `<!--ewc3:name-->`
	// opened a block that never closed, so every real marked region AFTER it stopped being
	// protected - and its definition was harvested and duplicated at the foot of the file.
	const src = [
		'| `npm run docs:values` | Refresh values between `<!--ewc3:name-->` markers |', '',
		'<!--ewc3:badgeTests-->',
		'[tests]: https://img.shields.io/badge/tests-115-brightgreen.svg',
		'<!--/ewc3:badgeTests-->', ''
	].join('\n');
	const out = format(src);
	const defs = (out.match(/^\[tests\]: /gm) || []).length;

	assert.strictEqual(defs, 1, `definition duplicated:\n${out}`);
	assert.strictEqual(format(out), out, 'must be idempotent');
});

test('an unterminated marker does not swallow the rest of the file', () => {
	const src = [
		'<!--ewc3:oops-->', '',
		'Ordinary prose that is long enough that it really does need to be wrapped somewhere before the hundred column mark.', ''
	].join('\n');
	const out = format(src);
	assert.ok(out.split('\n').length > 3, 'prose after an unclosed marker must still be formatted');
});

test('leaves the badge idiom untouched', () => {
	// [![alt](image)](href) is how every README writes a badge. The scan matches the OUTER bracket
	// with "![alt" as the link text, so it used to rewrite the IMAGE url into a reference and emit
	// [![alt][label]](href) - still valid markdown, rendered by GitHub, and not what was written.
	const src = '- [![CI/CD](https://github.com/ewc3labs/excel-power-query-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/ewc3labs/excel-power-query-editor/actions/workflows/ci.yml)\n';
	const out = format(src);

	assert.ok(out.includes('[![CI/CD](https://github.com/ewc3labs/excel-power-query-editor/actions/workflows/ci.yml/badge.svg)]'),
		`badge was rewritten:\n${out}`);
	assert.ok(!/\]\[[a-z-]+\]/.test(out), `image became a reference:\n${out}`);
});

test('leaves a plain image alone', () => {
	const src = '![a screenshot](https://example.com/some/quite/long/path/shot.png)\n';
	assert.strictEqual(format(src), src);
});

test('never wraps a list marker into column one', () => {
	// A dash used as punctuation mid-sentence becomes a NESTED LIST ITEM if a wrap lands it at the
	// start of a line. The words are identical and the document structure is not.
	const src = '- **Never trust green tests.** State the goal as green tests and green tests are what you get - agents will weaken an assertion to get there.\n';
	const out = format(src);
	const continuations = out.split('\n').slice(1);

	assert.ok(!continuations.some(l => /^\s*[-*+>#|]\s/.test(l)),
		`a wrap created a spurious list item:\n${out}`);
});

test('never wraps an ordered-list number into column one', () => {
	const src = 'Some prose that runs on for a good long while before it finally reaches the wrap column at 1. something\n';
	const out = format(src);
	assert.ok(!out.split('\n').slice(1).some(l => /^\s*\d+\.\s/.test(l)),
		`a wrap created a spurious ordered item:\n${out}`);
});

// --- links -----------------------------------------------------------------

console.log('\nlinks');

test('finds a link to a file that does not exist', () => {
	const dir = tmpdir();
	fs.writeFileSync(path.join(dir, 'a.md'), 'See [b](b.md).\n');
	const { problems } = checkLinks(dir, { orphanRoot: 'nope' });
	assert.strictEqual(problems.length, 1);
	assert.strictEqual(problems[0].why, 'does not exist');
});

test('finds an undefined reference', () => {
	const dir = tmpdir();
	fs.writeFileSync(path.join(dir, 'a.md'), 'A [thing][missing] here.\n');
	const { problems } = checkLinks(dir, { orphanRoot: 'nope' });
	assert.ok(problems.some(p => p.why === 'undefined reference'));
});

test('accepts a defined reference', () => {
	const dir = tmpdir();
	fs.writeFileSync(path.join(dir, 'a.md'), 'A [thing][ok].\n\n[ok]: https://example.com\n');
	const { problems } = checkLinks(dir, { orphanRoot: 'nope' });
	assert.deepStrictEqual(problems, []);
});

test('ignores links inside code fences', () => {
	const dir = tmpdir();
	fs.writeFileSync(path.join(dir, 'a.md'), '```\n[x](does-not-exist.md)\n```\n');
	const { problems } = checkLinks(dir, { orphanRoot: 'nope' });
	assert.deepStrictEqual(problems, []);
});

test('reports an orphaned document', () => {
	const dir = tmpdir();
	fs.mkdirSync(path.join(dir, 'docs'));
	fs.writeFileSync(path.join(dir, 'docs', 'Alone.md'), '# Alone\n');
	const { orphans } = checkLinks(dir, { orphanRoot: 'docs' });
	assert.deepStrictEqual(orphans, ['docs/Alone.md']);
});

test('a linked directory makes its contents reachable', () => {
	const dir = tmpdir();
	fs.mkdirSync(path.join(dir, 'docs', 'design'), { recursive: true });
	fs.writeFileSync(path.join(dir, 'docs', 'Index.md'), 'See [design](design/).\n');
	fs.writeFileSync(path.join(dir, 'docs', 'design', 'Note.md'), '# Note\n');
	fs.writeFileSync(path.join(dir, 'README.md'), 'See [index](docs/Index.md).\n');
	const { orphans } = checkLinks(dir, { orphanRoot: 'docs' });
	assert.deepStrictEqual(orphans, []);
});

// --- values ----------------------------------------------------------------

console.log('\nvalues');

test('replaces a stale value between markers', () => {
	const { text, replaced } = applyToText('We have <!--ewc3:tests-->63<!--/ewc3:tests--> tests.\n', { tests: '111' });
	assert.strictEqual(replaced, 1);
	assert.strictEqual(text, 'We have <!--ewc3:tests-->111<!--/ewc3:tests--> tests.\n');
});

test('leaves a current value alone', () => {
	const { replaced } = applyToText('<!--ewc3:tests-->111<!--/ewc3:tests-->\n', { tests: '111' });
	assert.strictEqual(replaced, 0);
});

test('reports a marker with no declared value', () => {
	const { unknown } = applyToText('<!--ewc3:nope-->1<!--/ewc3:nope-->\n', { tests: '111' });
	assert.deepStrictEqual(unknown, ['nope']);
});

test('replaces a whole block, for badges', () => {
	const src = '<!--ewc3:badge-->\n![old](https://img.shields.io/badge/tests-63-green.svg)\n<!--/ewc3:badge-->\n';
	const { text } = applyToText(src, { badge: '\n![new](https://img.shields.io/badge/tests-111-green.svg)\n' });
	assert.ok(text.includes('tests-111'));
	assert.ok(!text.includes('tests-63'));
});

test('counts regex matches across files', () => {
	const dir = tmpdir();
	fs.mkdirSync(path.join(dir, 'test'));
	fs.writeFileSync(path.join(dir, 'test', 'a.test.ts'), 'test("one", () => {});\ntest("two", () => {});\n');
	fs.writeFileSync(path.join(dir, 'test', 'b.test.ts'), '\tit("three", () => {});\n');
	const values = resolveValues({
		values: { tests: { countMatches: { files: ['test/*.ts'], pattern: '^\\s*(test|it)\\(' } } }
	}, dir);
	assert.strictEqual(values.tests, '3');
});

test('builds a string from other values', () => {
	const dir = tmpdir();
	fs.mkdirSync(path.join(dir, 'test'));
	fs.writeFileSync(path.join(dir, 'test', 'a.test.ts'), 'test("one", () => {});\n');
	const values = resolveValues({
		values: {
			tests: { countMatches: { files: ['test/*.ts'], pattern: '^\\s*(test|it)\\(' } },
			badge: { template: { text: 'tests-${tests}-brightgreen' } }
		}
	}, dir);
	assert.strictEqual(values.badge, 'tests-1-brightgreen');
});

test('a template naming an undeclared value fails loudly', () => {
	assert.throws(() => resolveValues({
		values: { badge: { template: { text: 'x-${nope}' } } }
	}, tmpdir()), /nope/);
});

test('reads a field from JSON', () => {
	const dir = tmpdir();
	fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '0.6.0' }));
	const values = resolveValues({ values: { v: { fromJson: { file: 'package.json', path: 'version' } } } }, dir);
	assert.strictEqual(values.v, '0.6.0');
});

test('counts entries in a JSON collection', () => {
	const dir = tmpdir();
	fs.writeFileSync(path.join(dir, 'package.json'),
		JSON.stringify({ contributes: { commands: [{ command: 'a' }, { command: 'b' }] } }));
	const values = resolveValues({
		values: { n: { countJson: { file: 'package.json', path: 'contributes.commands' } } }
	}, dir);
	assert.strictEqual(values.n, '2');
});

// ---------------------------------------------------------------------------

console.log(`\n${passed} passing, ${failed} failing\n`);
process.exit(failed ? 1 : 0);
