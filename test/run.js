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
const { expand } = require('../lib/glob');
const { migrateText } = require('../lib/migrate');
const { readSeries, lastNumber, undeclaredPrefixes, declaredOwnership,
	isLocalPrefix, roadmapFiles } = require('../lib/series');

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

test('never breaks an inline code span across lines', () => {
	// A split span still RENDERS fine - CommonMark converts the line ending to a space. The problem
	// is that this toolkit's scanners are line-based, so a split span defeats code-span stripping in
	// format, links, and values alike, and a `(img)` in an example becomes a link the checker chases.
	const src = 'Some prose that runs on for a good while before it reaches the wrap column so `- <!--ewc3:x-->[![Badge](img)](url)<!--/ewc3:x-->` renders as literal text.\n';
	const out = format(src);
	assert.ok(out.includes('`- <!--ewc3:x-->[![Badge](img)](url)<!--/ewc3:x-->`'),
		`a wrap split a code span:\n${out}`);
});

test('never wraps a raw-HTML token into column one', () => {
	// An HTML comment is a CommonMark type-2 block and MAY interrupt a paragraph. Once a wrap puts
	// one in column one the block splitter treats that line as verbatim forever, so the formatter is
	// stable on the damage and cannot undo it. The only fix is never to create it.
	const src = 'Prose that runs on for a good long while before it finally reaches the wrap column <!--ewc3:x-->and continues.\n';
	const out = format(src);
	assert.ok(!out.split('\n').slice(1).some(l => /^\s*</.test(l)),
		`a wrap created a raw-HTML line:\n${out}`);
});

// --- values ----------------------------------------------------------------

test('a marker inside a code span is not a value to substitute', () => {
	const src = 'Write `<!--ewc3:tests-->136<!--/ewc3:tests-->` to embed a count.\n';
	const r = applyToText(src, {});
	assert.deepStrictEqual(r.unknown, [], 'an example was treated as a live marker');
	assert.strictEqual(r.text, src);
});

test('a marker inside a fenced block is not a value to substitute', () => {
	const src = '```md\n<!--ewc3:tests-->136<!--/ewc3:tests-->\n```\n';
	const r = applyToText(src, {});
	assert.deepStrictEqual(r.unknown, []);
	assert.strictEqual(r.text, src);
});

test('a real marker outside code is still substituted', () => {
	const src = 'Suite: <!--ewc3:tests-->1<!--/ewc3:tests--> tests, e.g. `<!--ewc3:tests-->`.\n';
	const r = applyToText(src, { tests: 136 });
	assert.ok(r.text.includes('<!--ewc3:tests-->136<!--/ewc3:tests-->'));
	assert.strictEqual(r.replaced, 1);
});


test('converges in one pass on a CRLF file', () => {
	// A CRLF file never converged: rewrapped prose loses its carriage returns while verbatim lines
	// keep theirs, so every pass changed a few more and `fix` was always followed by a failing
	// `check`. Measured on a real README: 49 carriage returns, falling by three per pass.
	const { formatFiles } = require('../lib/format');
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ewc3-crlf-'));
	const file = path.join(dir, 'a.md');
	const body = '# Title\n\nSome prose that runs on for a good long while indeed before it finally reaches the wrap column and has to be broken somewhere sensible.\n\n| a | b |\n| --- | --- |\n';
	fs.writeFileSync(file, body.replace(/\n/g, '\r\n'));

	assert.deepStrictEqual(formatFiles([file], { check: true }).length, 1, 'nothing to do?');
	formatFiles([file]);
	assert.deepStrictEqual(formatFiles([file], { check: true }), [], 'did not converge in one pass');

	const after = fs.readFileSync(file, 'utf8');
	assert.ok(after.includes('\r\n'), 'the file lost its line endings');
	assert.ok(!/[^\r]\n/.test(after), 'the file ended up with mixed line endings');
});

// --- documentation coverage -------------------------------------------------
//
// DOGFOOD. The toolkit's own rule is "derive what can be derived, check what cannot", and a list of
// commands in a document is exactly the kind of thing that goes stale silently. This caught a real
// one: every guide referenced `ewc3-docs fix` for a week before the command existed, because the
// shell shortcuts wrapped it and the failing exit code was swallowed by a fallback.

const BIN = fs.readFileSync(path.join(__dirname, '..', 'bin', 'ewc3-docs.js'), 'utf8');
const USAGE = fs.readFileSync(path.join(__dirname, '..', 'USAGE.txt'), 'utf8');
const REFERENCE = fs.readFileSync(path.join(__dirname, '..', 'docs', 'Reference.md'), 'utf8');

const commands = [...BIN.matchAll(/^\tcase '([a-z]+)':/gm)].map(m => m[1]);

test('every command the CLI dispatches is in USAGE.txt', () => {
	assert.ok(commands.length >= 5, `only found ${commands.length} commands - the scan is broken`);
	const missing = commands.filter(c => !USAGE.includes(`ewc3-docs ${c}`));
	assert.deepStrictEqual(missing, [], `undocumented in USAGE.txt: ${missing.join(', ')}`);
});

test('every command the CLI dispatches is in the reference', () => {
	const missing = commands.filter(c => !new RegExp('`' + c + '[ `]').test(REFERENCE));
	assert.deepStrictEqual(missing, [], `undocumented in docs/Reference.md: ${missing.join(', ')}`);
});

test('USAGE.txt does not describe a command that does not exist', () => {
	const claimed = [...USAGE.matchAll(/ewc3-docs ([a-z]+)/g)].map(m => m[1]);
	const phantom = [...new Set(claimed)].filter(c => !commands.includes(c));
	assert.deepStrictEqual(phantom, [], `USAGE.txt describes non-existent command(s): ${phantom.join(', ')}`);
});

test('every flag the CLI reads is documented', () => {
	const flags = [...new Set([...BIN.matchAll(/'(--[a-z-]+)'/g)].map(m => m[1]))];
	assert.ok(flags.length >= 2, `only found ${flags.length} flags - the scan is broken`);
	const missing = flags.filter(f => !REFERENCE.includes('`' + f));
	assert.deepStrictEqual(missing, [], `undocumented flag(s): ${missing.join(', ')}`);
});

test('every resolver is documented', () => {
	const { RESOLVERS } = require('../lib/values');
	const missing = Object.keys(RESOLVERS).filter(r => !REFERENCE.includes('`' + r + '`'));
	assert.deepStrictEqual(missing, [], `undocumented resolver(s): ${missing.join(', ')}`);
});

test('every config field the code reads is documented', () => {
	const fields = [...new Set([...BIN.matchAll(/config\.([a-zA-Z]+)/g)].map(m => m[1]))]
		.filter(f => !f.startsWith('_'));
	assert.ok(fields.length >= 5, `only found ${fields.length} config fields - the scan is broken`);
	const missing = fields.filter(f => !REFERENCE.includes('`' + f + '`'));
	assert.deepStrictEqual(missing, [], `undocumented config field(s): ${missing.join(', ')}`);
});

test('every format default is documented', () => {
	const { DEFAULTS } = require('../lib/format');
	const missing = Object.keys(DEFAULTS).filter(k => !REFERENCE.includes('`format.' + k + '`'));
	assert.deepStrictEqual(missing, [], `undocumented format option(s): ${missing.join(', ')}`);
});

test('every directory skipped by default is documented', () => {
	const { DEFAULT_SKIP } = require('../lib/links');
	const missing = DEFAULT_SKIP.filter(d => !REFERENCE.includes(d));
	assert.deepStrictEqual(missing, [], `undocumented skipped dir(s): ${missing.join(', ')}`);
});

// --- glob ------------------------------------------------------------------

console.log('\nglob');

function treeWithSubdirs() {
	const dir = tmpdir();
	fs.mkdirSync(path.join(dir, 'docs', 'project', 'slices'), { recursive: true });
	fs.writeFileSync(path.join(dir, 'docs', 'a.md'), 'x');
	fs.writeFileSync(path.join(dir, 'docs', 'project', 'b.md'), 'x');
	fs.writeFileSync(path.join(dir, 'docs', 'project', 'slices', 'c.md'), 'x');
	fs.writeFileSync(path.join(dir, 'docs', 'notes.txt'), 'x');
	return dir;
}

test('`docs/**.md` reaches subdirectories', () => {
	// THE REGRESSION. `**` used to be detected by splitting on "/" and testing whether an element
	// equalled "**" - false for `docs/**.md`, whose second element is `**.md`. The spec silently
	// degraded to `docs/*.md`, and since it is also the DEFAULT include, every repo using the
	// default checked only its top-level docs while being told everything passed.
	assert.strictEqual(expand('docs/**.md', treeWithSubdirs()).length, 3);
});

test('`docs/**/*.md` means the same thing', () => {
	assert.strictEqual(expand('docs/**/*.md', treeWithSubdirs()).length, 3);
});

test('`docs/*.md` stays shallow', () => {
	assert.strictEqual(expand('docs/*.md', treeWithSubdirs()).length, 1);
});

test('a recursive glob respects the extension', () => {
	// notes.txt must not come along.
	const files = expand('docs/**.md', treeWithSubdirs());
	assert.ok(files.every(f => f.endsWith('.md')), files.join(', '));
});

test('a literal path resolves, and a missing one yields nothing', () => {
	const dir = treeWithSubdirs();
	assert.strictEqual(expand('docs/a.md', dir).length, 1);
	assert.strictEqual(expand('docs/nope.md', dir).length, 0);
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

test('takes the HIGHEST captured number, not the count', () => {
	// A roadmap "last number" cell is the INPUT to minting an ID. Counting rows gives the right
	// answer only while the series is contiguous, and starts handing out taken IDs the moment one
	// is retired.
	const dir = tmpdir();
	fs.writeFileSync(path.join(dir, 'roadmap.md'),
		'| PQ-9 | x |\n| PQ-31 | y |\n| PQ-4 | z |\n');
	const values = resolveValues({
		values: { last: { maxMatch: { files: ['roadmap.md'], pattern: '^\\| PQ-(\\d+)' } } }
	}, dir);
	assert.strictEqual(values.last, '31');
});

test('is not fooled by a gap in the series', () => {
	// Three rows, highest is 34. A count would say 3.
	const dir = tmpdir();
	fs.writeFileSync(path.join(dir, 'roadmap.md'), '| PQ-1 | x |\n| PQ-2 | y |\n| PQ-34 | z |\n');
	const values = resolveValues({
		values: { last: { maxMatch: { files: ['roadmap.md'], pattern: '^\\| PQ-(\\d+)' } } }
	}, dir);
	assert.strictEqual(values.last, '34', 'must be the max, never the count');
});

test('respects the anchor, so prose cannot inflate it', () => {
	const dir = tmpdir();
	fs.writeFileSync(path.join(dir, 'roadmap.md'),
		'| PQ-7 | x |\nsee PQ-9999 in the notes\n');
	const values = resolveValues({
		values: { last: { maxMatch: { files: ['roadmap.md'], pattern: '^\\| PQ-(\\d+)' } } }
	}, dir);
	assert.strictEqual(values.last, '7');
});

test('returns 0 when nothing matches', () => {
	// An absurd value is better than a plausible one: a broken pattern should look broken.
	const dir = tmpdir();
	fs.writeFileSync(path.join(dir, 'roadmap.md'), 'nothing here\n');
	const values = resolveValues({
		values: { last: { maxMatch: { files: ['roadmap.md'], pattern: '^\\| PQ-(\\d+)' } } }
	}, dir);
	assert.strictEqual(values.last, '0');
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
// ID series. Untested until now, which is uncomfortable given this module decides what number gets
// minted next: every failure here hands out an ID that is already taken, silently.

function roadmapRepo(body) {
	const dir = tmpdir();
	fs.mkdirSync(path.join(dir, 'docs', 'project'), { recursive: true });
	fs.writeFileSync(path.join(dir, 'docs', 'project', 'X_Development_Roadmap.md'), body);
	return dir;
}

const OWNS_VS = '| Prefix | Owner | Series description |\n| --- | --- | --- |\n| VS | x | slices |\n';

test('[series] last number is the MAX, never a count', () => {
	// A count agrees with the max only while the series is contiguous, and starts handing out taken
	// numbers the moment one is retired. One row holding VS-42 must report 42, not 1.
	const dir = roadmapRepo(`${OWNS_VS}\n| ID | Slice |\n| --- | --- |\n| VS-42 | only row |\n`);
	assert.strictEqual(lastNumber(dir, 'VS'), 42);
});

test('[series] a retired ID does not lower the next mint', () => {
	const dir = roadmapRepo(`${OWNS_VS}\n| ID | Slice |\n| --- | --- |\n| VS-1 | a |\n| VS-9 | b |\n`);
	assert.strictEqual(lastNumber(dir, 'VS'), 9);
});

test('[series] prose cannot inflate the series', () => {
	// The anchor is the defence: an ID must be a table row's FIRST cell to count. Without this, any
	// sentence mentioning a slice would push the next mint past it.
	const dir = roadmapRepo(`${OWNS_VS}\nWe should revisit VS-123 next quarter, then VS-999.\n`);
	assert.strictEqual(lastNumber(dir, 'VS'), 0);
});

test('[series] an ID in a second column does not count either', () => {
	const dir = roadmapRepo(`${OWNS_VS}\n| Slice | ID |\n| --- | --- |\n| a thing | VS-123 |\n`);
	assert.strictEqual(lastNumber(dir, 'VS'), 0);
});

test('[series] using a prefix without declaring it is reported', () => {
	// This is what makes the ownership table load-bearing instead of decorative.
	const dir = roadmapRepo(`${OWNS_VS}\n| ID | Slice |\n| --- | --- |\n| DT-3 | undeclared |\n`);
	const problems = undeclaredPrefixes(dir);
	assert.strictEqual(problems.length, 1);
	assert.strictEqual(problems[0].prefix, 'DT');
	assert.strictEqual(problems[0].highest, 3);
});

test('[series] a declared prefix is not reported', () => {
	const dir = roadmapRepo(`${OWNS_VS}\n| ID | Slice |\n| --- | --- |\n| VS-3 | declared |\n`);
	assert.deepStrictEqual(undeclaredPrefixes(dir), []);
});

test('[series] the ownership table stops at the blank line after it', () => {
	// Rows below the table belong to other tables. An unbounded scan would read the NEXT table's
	// header cell `| ID |` as a declaration, because a bare uppercase token is exactly what a
	// declaration looks like. Assert the set EXACTLY: 'no DT' is too weak to catch that.
	const dir = roadmapRepo(OWNS_VS + `
| ID | Slice |
| --- | --- |
| DT-1 | a row |
`);
	const { declared } = readSeries(path.join(dir, 'docs', 'project', 'X_Development_Roadmap.md'));
	assert.deepStrictEqual([...declared].sort(), ['VS'],
		'only the ownership table may declare; a later table must contribute nothing');
});

test('[series] FIX is repo-local, everything else is global', () => {
	assert.ok(isLocalPrefix('FIX'));
	assert.ok(isLocalPrefix('fix'), 'case must not decide ownership scope');
	assert.ok(!isLocalPrefix('VS'));
	assert.ok(!isLocalPrefix('DT'));
});

test('[series] declared ownership names the file that claims each prefix', () => {
	const dir = roadmapRepo(OWNS_VS);
	const owners = declaredOwnership(dir);
	assert.deepStrictEqual([...owners.keys()], ['VS']);
	assert.strictEqual(owners.get('VS').length, 1);
	assert.match(owners.get('VS')[0], /X_Development_Roadmap\.md$/);
});

test(`[series] the MedAR "Series / Last Num" table declares NOTHING - the migration trigger`, () => {
	// SX_Coder's register is headed `| Series | Last Num | ... |`, not `| Prefix | ... |`, so no
	// ownership table is found at all and every prefix in use reads as undeclared. Pinning this means
	// the project_v2 migration cannot quietly appear to succeed against an unmigrated register.
	const dir = roadmapRepo(
		'| Series | Last Num | Series Description |\n| --- | --- | --- |\n| Vertical Slices | VS-390 | x |\n' +
		'\n| ID | Slice |\n| --- | --- |\n| VS-390 | a slice |\n');
	const file = path.join(dir, 'docs', 'project', 'X_Development_Roadmap.md');
	assert.strictEqual(readSeries(file).declared.size, 0,
		'a Series-headed register must not be mistaken for an ownership table');
	assert.strictEqual(undeclaredPrefixes(dir).length, 1,
		'and the guard must therefore fire, rather than reporting a clean repo');
});

test('[series] a repo with no roadmap at all yields no series and no crash', () => {
	const dir = tmpdir();
	assert.deepStrictEqual(roadmapFiles(dir, null), []);
	assert.strictEqual(lastNumber(dir, 'VS'), 0);
	assert.deepStrictEqual(undeclaredPrefixes(dir), []);
});


// ---------------------------------------------------------------------------
// Migrating a MedAR register to the ownership table. Non-destructive by contract, so the tests that
// matter most are the ones asserting nothing was lost and nothing was invented.

const REGISTER = `# Roadmap

## Number Series

| Series | Last Num | Series Description |
| --- | --- | --- |
| Vertical Slices | VS-392 | Feature drops |
| Hotfixes | FIX-91 | Emergent fixes |
| Cross-Project | TS-02 · DW-024 | Sibling-repo work |

## Delivery Index

| ID | Slice |
| --- | --- |
| VS-392 | a slice |
| DT-01 | minted in DevTools, not here |
`;

test('[migrate] one register cell naming two series becomes two rows', () => {
	const r = migrateText(REGISTER, { owner: 'SX_Coder' });
	const p = r.rows.map((x) => x.prefix);
	assert.ok(p.includes('TS') && p.includes('DW'),
		'TS-02 · DW-024 is two series sharing a cell, and must not survive as one row');
});

test('[migrate] a prefix used but never registered is NOT claimed for this repo', () => {
	// The measured case: SX_Coder uses DT-01 while DT is minted in DevTools, whose roadmap already
	// records DT-042 being minted twice by two registers that each thought they owned it. Claiming it
	// here would manufacture that collision under a migration advertised as lossless.
	const r = migrateText(REGISTER, { owner: 'SX_Coder' });
	const dt = r.rows.find((x) => x.prefix === 'DT');
	assert.ok(dt, 'the unregistered prefix must still appear, or the problem stays invisible');
	assert.strictEqual(dt.owner, null, 'an unregistered prefix must not be auto-assigned an owner');
	assert.match(r.text, /\*\*\?\*\* _unclaimed_/, 'and it must render as a question a human resolves');
});

test('[migrate] a registered prefix keeps its owner', () => {
	const r = migrateText(REGISTER, { owner: 'SX_Coder' });
	assert.strictEqual(r.rows.find((x) => x.prefix === 'VS').owner, 'SX_Coder');
});

test('[migrate] a register number behind the index is reported as stale', () => {
	// The register is an INPUT to minting and goes stale; the IDs are evidence and cannot. This
	// direction of disagreement means the next mint reuses a live number.
	const behind = REGISTER.replace('| VS-392 | a slice |', '| VS-500 | a later slice |');
	const r = migrateText(behind, { owner: 'SX_Coder' });
	const vs = r.rows.find((x) => x.prefix === 'VS');
	assert.strictEqual(vs.stale, true);
	assert.strictEqual(vs.lastUsed, 500, 'the evidence wins over the stale register cell');
});

test('[migrate] the original register survives verbatim', () => {
	const r = migrateText(REGISTER, { owner: 'SX_Coder' });
	for (const line of ['| Vertical Slices | VS-392 | Feature drops |',
		'| Cross-Project | TS-02 · DW-024 | Sibling-repo work |']) {
		assert.ok(r.text.includes(line), `migration dropped: ${line}`);
	}
});

test('[migrate] IDs are padded to five in the emitted table', () => {
	const r = migrateText(REGISTER, { owner: 'SX_Coder' });
	assert.match(r.text, /VS-00392/);
	assert.match(r.text, /FIX-00091/);
	assert.doesNotMatch(r.text.split('<details>')[0], /\| VS-392 \|/,
		'the emitted table must not keep the unpadded form');
});

test('[migrate] a document with no register is reported, not half-migrated', () => {
	const r = migrateText('# Roadmap\n\nNothing here.\n', { owner: 'X' });
	assert.strictEqual(r.ok, false);
	assert.strictEqual(r.reason, 'no-register');
	assert.strictEqual(r.text, null, 'no text means the caller cannot accidentally write a partial');
});


// ---------------------------------------------------------------------------

console.log(`\n${passed} passing, ${failed} failing\n`);
process.exit(failed ? 1 : 0);
