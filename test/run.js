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
const { extractSlices } = require('../lib/slices');
const { checkTable } = require('../lib/tables');
const { readSeries, lastNumber, undeclaredPrefixes, declaredOwnership,
	isLocalPrefix, roadmapFiles, declaredIds, frozenViolations, contestedPrefixes,
	withoutFences, DEFAULT_ROADMAPS } = require('../lib/series');
const frontmatter = require('../lib/frontmatter');

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

const commands = [...BIN.matchAll(/^\tcase '([a-z][a-z-]*)':/gm)].map(m => m[1]);

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
	const claimed = [...USAGE.matchAll(/ewc3-docs ([a-z][a-z-]*)/g)].map(m => m[1]);
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

test('[series] a human-named first cell declares nothing, even beside a Last Used column', () => {
	// "Vertical Slices" is a label, not a prefix. Mining the prefix out of the neighbouring cell
	// instead is how a checker ends up knowing three register shapes; the register is brought to
	// the template rather than the parser to the register.
	const dir = roadmapRepo(
		'| Series | Last Num | Series Description |\n| --- | --- | --- |\n| Vertical Slices | VS-390 | x |\n' +
		'\n| ID | Slice |\n| --- | --- |\n| VS-390 | a slice |\n');
	const file = path.join(dir, 'docs', 'project', 'X_Development_Roadmap.md');
	assert.strictEqual(readSeries(file).declared.size, 0);
	assert.strictEqual(undeclaredPrefixes(dir).length, 1);
});
test('[series] a prefix named in a neighbouring cell is a mention, not a mint', () => {
	// SX_Coder's cross-project row names `AIR`, `DW` and `DT` in prose while owning none of them.
	// Only the first cell of the ownership table declares, so that row claims nothing.
	const dir = roadmapRepo(
		'| Prefix | Scope | Owner | Last Used | Series |\n| --- | --- | --- | --- | --- |\n' +
		'| TS | global | x | TS-2 | mint `AIR-01`=Runtime, `DW-01`=Warehouse for new |\n');
	const read = readSeries(path.join(dir, 'docs', 'project', 'X_Development_Roadmap.md'));
	assert.deepStrictEqual([...read.declared].sort(), ['TS'],
		'only the first cell declares; prefixes named beside it do not');
});
function backlogRepo(roadmapBody, backlogBody) {
	const dir = tmpdir();
	fs.mkdirSync(path.join(dir, 'docs', 'project', 'backlog'), { recursive: true });
	fs.writeFileSync(path.join(dir, 'docs', 'project', 'X_Development_Roadmap.md'), roadmapBody);
	fs.writeFileSync(path.join(dir, 'docs', 'project', 'backlog', 'X_Backlog.md'), backlogBody);
	return dir;
}

test('[series] a DECLARED scope beats the hardcoded prefix guess', () => {
	// `isLocalPrefix` knows about FIX and nothing else, which is right for this toolkit and cannot
	// be right for every register. A repository that has written down what it means is believed.
	const dir = roadmapRepo('| Prefix | Scope | Owner | Last Used | Series |\n| --- | --- | --- | --- | --- |\n| PQ | repo-local | x | PQ-7 | slices |\n');
	const read = readSeries(path.join(dir, 'docs', 'project', 'X_Development_Roadmap.md'));
	assert.strictEqual(read.scopes.get('PQ').local, true, 'the register said repo-local, so PQ is repo-local');
	assert.strictEqual(isLocalPrefix('PQ'), false, 'even though the hardcoded fallback would not say so');
});
test('[series] a FROZEN series records its ceiling, so minting past it is detectable', () => {
	// A freeze expressed only in prose is a convention, not a control - the exact failure this
	// toolkit exists to end. Measured: MedAR_AI_Runtime retired OPS at 08 and every checker in the
	// estate would still have accepted OPS-09 as the next mint.
	const dir = roadmapRepo('| Prefix | Scope | Owner | Last Used | Series |\n| --- | --- | --- | --- | --- |\n| OPS | frozen at 8 | x | OPS-8 | retired; mint AIR |\n');
	const read = readSeries(path.join(dir, 'docs', 'project', 'X_Development_Roadmap.md'));
	const ops = read.scopes.get('OPS');
	assert.strictEqual(ops.frozen, true, 'the register retired this series');
	assert.strictEqual(ops.ceiling, 8, 'and named the number it stops at');
});
test('[series] a `Series`-headed register declares NOTHING - one template, not N parsers', () => {
	// SUPERSEDES the version of this test written 2026-08-30, and restores the contract that one
	// replaced. The detour is worth recording: the checker was taught to read a `Series` header, a
	// mint template in the first cell, and a prefix hiding in a `Last Num` cell - three register
	// shapes met in one estate. Each shape a checker learns is a shape it will half-accept a
	// FOURTH version of, silently, and a guess is not a check.
	//
	// The premise that justified it was that migrating the estate is expensive. It is a header
	// row. See docs/design/one-template-beats-three-parsers.md.
	const dir = roadmapRepo('| Series | Scope | Meaning | Last Num | Next |\n| --- | --- | --- | --- | --- |\n| `AIR-NN` | repo-owned | value slices | 28 | **AIR-29** |\n\n| ID | Slice |\n| --- | --- |\n| AIR-28 | a thing |\n');
	const file = path.join(dir, 'docs', 'project', 'X_Development_Roadmap.md');
	assert.strictEqual(readSeries(file).declared.size, 0,
		'a Series-headed register is not an ownership table');
	assert.strictEqual(undeclaredPrefixes(dir).length, 1,
		'so the guard fires, and the repo is told to bring its register to the template');
});
test('[series] an ACTUAL id in the first cell does not declare a series', () => {
	// `AIR-NN` is a mint template and declares; `AIR-28` is an ID and declares nothing. Without
	// that discrimination a Delivery Index row would be read as an ownership row, and every
	// roadmap would silently declare every prefix it happened to use.
	const dir = roadmapRepo('| Series | Meaning |\n| --- | --- |\n| `AIR-28` | not a declaration |\n\n| ID | Slice |\n| --- | --- |\n| DT-3 | undeclared |\n');
	const problems = undeclaredPrefixes(dir);
	assert.ok(problems.some((p) => p.prefix === 'DT'), 'DT should still be reported as undeclared');
});

test('[series] a backlog inherits the ownership table of the roadmap beside it', () => {
	// Declaration is REPOSITORY-scoped. A backlog mints into the same series as its roadmap, so
	// requiring it to carry a second ownership table would mean two registers for one set of
	// prefixes - the exact drift this tool exists to stop.
	const dir = backlogRepo(
		`${OWNS_VS}\n| ID | Slice |\n| --- | --- |\n| VS-4 | in the index |\n`,
		'## Ordered Backlog\n\n1. `VS-07` - not declared here, and that is fine\n');
	assert.deepStrictEqual(undeclaredPrefixes(dir), []);
});

test('[series] a repo that declares NOWHERE is still reported', () => {
	// The inheritance above must not become a blanket amnesty: a repository with IDs and no
	// ownership table anywhere has still told us nothing about what it owns.
	const dir = backlogRepo(
		'| ID | Slice |\n| --- | --- |\n| VS-4 | no ownership table anywhere |\n',
		'1. `VS-07` - also nothing\n');
	const problems = undeclaredPrefixes(dir);
	assert.ok(problems.length > 0, 'a repo declaring nowhere must still be reported');
});

test('[series] the REGISTER arbitrates an unseparated heading', () => {
	// EPQE's guard alone was measured to cost real declarations: ALL 24 of SX_DW's slice headings
	// are `### DW-001 Title` with no separator, and two of them exist ONLY as headings - exactly
	// the IDs the heading position was added to catch. So the register decides: a heading naming a
	// prefix this roadmap OWNS is naming the thing the section IS.
	const owns = '| Prefix | Scope | Owner | Last Used | Series |\n| --- | --- | --- | --- | --- |\n| DW | global | x | DW-1 | slices |\n';
	const dir = roadmapRepo(owns + '\n### DW-023 Queue flag Q + synthetic machine-status contract\n');
	assert.strictEqual(lastNumber(dir, 'DW'), 23,
		'a heading naming an OWNED prefix declares, separator or not');
});

test('[series] a heading naming a FOREIGN prefix cites, whatever its punctuation', () => {
	const owns = '| Prefix | Scope | Owner | Last Used | Series |\n| --- | --- | --- | --- | --- |\n| DT | global | x | DT-1 | ours |\n';
	const dir = roadmapRepo(owns + '\n| ID | Slice |\n| --- | --- |\n| DT-1 | a thing |\n\n## Notes\n\n### PQ-34 changed how the other repo publishes\n');
	assert.deepStrictEqual(undeclaredPrefixes(dir), [],
		'a repo must never be told to declare a prefix it does not own');
});

test('[frontmatter] the restricted subset a slice document actually needs', () => {
	const { data, body, had } = frontmatter.read('---\nid: VS-00397\ntitle: Two writers own MFM.Doctors\nstate: coded   # a judgement\nest: 4.0d\ndepends_on: [VS-00352, VS-00353]\nfollowers:\n  - VS-00398\nimplements:\n---\n\n# The narrative\n');
	assert.strictEqual(had, true);
	assert.strictEqual(data.id, 'VS-00397');
	assert.strictEqual(data.title, 'Two writers own MFM.Doctors');
	assert.strictEqual(data.state, 'coded', 'a trailing # comment is not part of the value');
	assert.deepStrictEqual(data.depends_on, ['VS-00352', 'VS-00353']);
	assert.deepStrictEqual(data.followers, ['VS-00398'], 'block list');
	assert.strictEqual(data.implements, null, "an empty value is null, not the empty string");
	assert.strictEqual(body, '# The narrative\n');
});

test('[frontmatter] a document with no frontmatter is not an error', () => {
	const r = frontmatter.read('# Just a document\n');
	assert.strictEqual(r.had, false);
	assert.deepStrictEqual(r.data, {});
});

test('[frontmatter] ` #` ends a plain scalar, as YAML says - quote to keep it', () => {
	// Checked against the spec rather than assumed: an unquoted scalar ENDS at a space-hash, so
	// a title containing # must be quoted. My first version of this test asserted the opposite
	// and the parser was right - silently truncating a slice title is exactly the kind of thing
	// worth pinning.
	assert.strictEqual(frontmatter.read('---\ntitle: Fix the #4 lookup\n---\n').data.title, 'Fix the',
		'an unquoted value is truncated at ` #`');
	assert.strictEqual(frontmatter.read('---\ntitle: "Fix the #4 lookup"\n---\n').data.title, 'Fix the #4 lookup',
		'quoting keeps it');
	assert.strictEqual(frontmatter.read('---\ntitle: C#\n---\n').data.title, 'C#',
		'a hash with no space before it is just a character');
});
test('[frontmatter] REFUSES what it does not support, rather than guessing', () => {
	// The whole grammar is flat key/value plus lists. A document needing more is doing too much,
	// and this toolkit spent a week learning that a guess is not a check.
	assert.throws(() => frontmatter.read('---\nowner:\n  name: nested\n---\n'), /nested keys/);
	assert.throws(() => frontmatter.read('---\nbody: |\n  a block scalar\n---\n'), /block scalars/);
	assert.throws(() => frontmatter.read('---\nnot a key value line\n---\n'), /not `key: value`/);
	assert.throws(() => frontmatter.read('---\nid: VS-1\n'), /never closed/);
});

test('[frontmatter] write preserves the body and the line endings', () => {
	const doc = '---\nid: VS-1\nstate: planned\n---\n\n# Title\n\nProse that must not move.\n';
	const { data } = frontmatter.read(doc);
	data.state = 'coded';
	const out = frontmatter.write(doc, data);
	assert.ok(out.includes('state: coded'));
	assert.ok(out.endsWith('# Title\n\nProse that must not move.\n'));

	const crlfDoc = doc.split('\n').join('\r\n');
	const crlfOut = frontmatter.write(crlfDoc, frontmatter.read(crlfDoc).data);
	assert.ok(crlfOut.includes('\r\n'), 'a CRLF document stays CRLF');
});

test('[frontmatter] rewriting an unchanged document is a no-op', () => {
	// Idempotent, always - the canon rule. A fold that is not idempotent cannot run automatically,
	// which returns it to a human, which is where we started.
	const doc = '---\nid: VS-1\nstate: planned\ndepends_on: [VS-2]\nimplements:\n---\n\n# Title\n';
	const once = frontmatter.write(doc, frontmatter.read(doc).data);
	const twice = frontmatter.write(once, frontmatter.read(once).data);
	assert.strictEqual(once, doc);
	assert.strictEqual(twice, once);
});

test('[series] a heading that CITES a sibling slice does not declare it', () => {
	// Found by EPQE. The list pattern required a trailing separator and the heading pattern did
	// not, so a Notes section citing another repository's slice failed the repo with instructions
	// to declare a prefix it does not own - the one remedy that must never be followed.
	const cites = roadmapRepo(`${OWNS_VS}\n| ID | Slice |\n| --- | --- |\n| VS-1 | a thing |\n`
		+ '\n## Notes\n\n### PQ-34 changed how the other repo publishes\n');
	assert.deepStrictEqual(undeclaredPrefixes(cites), [],
		'a heading with no separator is prose, not a mint');
});

test('[series] a heading that DECLARES still counts, including runs and ranges', () => {
	const one = roadmapRepo(`${OWNS_VS}\n### VS-23 — queue flag contract\n`);
	assert.strictEqual(lastNumber(one, 'VS'), 23);
	const run = roadmapRepo(`${OWNS_VS}\n### VS-24 / FIX-89 — the target model\n`);
	assert.strictEqual(lastNumber(run, 'VS'), 24, 'a `/` run is still a declaring heading');
	const range = roadmapRepo(`${OWNS_VS}\n### VS-25 through VS-26 — billing rules\n`);
	assert.strictEqual(lastNumber(range, 'VS'), 25, 'a range heading declares from its anchor');
});

test('[series] a FENCED example is a mention, not a mint', () => {
	// Found by codex. A roadmap that documents its own syntax pushed `lastId` to the number in
	// the example, and a fenced table row for a foreign prefix produced a FALSE undeclared-prefix
	// failure. The toolkit already learned this once for `values` (DT-10) and the lesson did not
	// carry to the ID scanners - which is the exact class the mention-is-not-a-mint rule names.
	const dir = roadmapRepo(`${OWNS_VS}\n| ID | Slice |\n| --- | --- |\n| VS-3 | the real highest |\n`
		+ '\n```markdown\n1. `VS-99` - an example\n| DT-77 | planned | an example row |\n```\n');
	assert.strictEqual(lastNumber(dir, 'VS'), 3, 'a fenced VS-99 must not move the series');
	assert.deepStrictEqual(undeclaredPrefixes(dir), [],
		'and a fenced DT-77 must not be reported as an undeclared prefix');
});

test('[series] withoutFences keeps the line count, so reported lines stay true', () => {
	const out = withoutFences('a\n```\nhidden\n```\nb');
	assert.strictEqual(out.split('\n').length, 5);
	assert.strictEqual(out.split('\n')[4], 'b');
});

test('[series] a freeze is enforced across EVERY planning surface, not just its own', () => {
	// Found by codex. Declaration is repository-scoped, so enforcement has to be: a roadmap
	// frozen at OPS-8 beside a backlog minting OPS-9 reported a clean repo, because the ceiling
	// was only ever compared with the declaring file's own IDs.
	const dir = backlogRepo(
		'| Prefix | Scope | Owner | Last Used | Series |\n| --- | --- | --- | --- | --- |\n| OPS | frozen at 8 | x | OPS-8 | retired |\n',
		'1. `OPS-9` - minted past the freeze, on the inheriting surface\n');
	const v = frozenViolations(dir);
	assert.strictEqual(v.length, 1, 'the backlog mint must be caught');
	assert.strictEqual(v[0].prefix, 'OPS');
	assert.strictEqual(v[0].ceiling, 8);
	assert.strictEqual(v[0].highest, 9);
});

test('[series] a `reference-only` row DOCUMENTS a prefix without CLAIMING it', () => {
	// Asked by SX_DW, whose register states the prefixes it cites but does not own. Stating that
	// is better than silence - but a row saying "not mine" must not then read as an ownership
	// claim, or the register contradicts itself and the estate scan reports a false collision.
	const reg = '| Prefix | Scope | Owner | Last Used | Series |\n| --- | --- | --- | --- | --- |\n'
		+ '| DW | global | SX_DW | DW-24 | ours |\n'
		+ '| VS | reference-only | SX_Coder | - | cited here, never minted here |\n';
	const dir = roadmapRepo(reg + '\n| ID | Slice |\n| --- | --- |\n| DW-24 | a thing |\n');
	const read = readSeries(path.join(dir, 'docs', 'project', 'X_Development_Roadmap.md'));
	assert.deepStrictEqual([...read.declared].sort(), ['DW'],
		'a reference-only prefix is not declared');
	assert.strictEqual(read.scopes.get('VS').reference, true,
		'but the row is kept, so it still documents');
});

test('[series] MINTING under a reference-only prefix still fails', () => {
	// The point of dropping it from `declared`. If saying "I do not own VS" also silenced the
	// undeclared-prefix check, the row would buy silence rather than safety.
	const reg = '| Prefix | Scope | Owner | Last Used | Series |\n| --- | --- | --- | --- | --- |\n'
		+ '| DW | global | SX_DW | DW-24 | ours |\n'
		+ '| VS | reference-only | SX_Coder | - | cited here, never minted here |\n';
	const dir = roadmapRepo(reg + '\n| ID | Slice |\n| --- | --- |\n| VS-500 | minted where it must not be |\n');
	const problems = undeclaredPrefixes(dir);
	assert.ok(problems.some((p) => p.prefix === 'VS'),
		'minting VS here must be reported, precisely because the register disclaims it');
});

test('[series] a reference-only row can ALSO carry a freeze', () => {
	// SX_DW documents TS as frozen at TS-02 and owned by SX_Coder. Both halves must work: not a
	// claim, and still a ceiling, so nobody mints TS-03 here.
	const reg = '| Prefix | Scope | Owner | Last Used | Series |\n| --- | --- | --- | --- | --- |\n'
		+ '| DW | global | SX_DW | DW-1 | ours |\n'
		+ '| TS | reference-only, frozen at 2 | SX_Coder | TS-02 | legacy; do not mint |\n';
	const dir = roadmapRepo(reg + '\n| ID | Slice |\n| --- | --- |\n| TS-3 | minted past a retired series |\n');
	const read = readSeries(path.join(dir, 'docs', 'project', 'X_Development_Roadmap.md'));
	assert.strictEqual(read.scopes.get('TS').reference, true);
	assert.strictEqual(read.scopes.get('TS').frozen, true);
	const v = frozenViolations(dir);
	assert.ok(v.some((x) => x.prefix === 'TS'), 'the freeze still bites on a documented series');
});

test('[series] a DECLARED repo-local prefix is not a global collision', () => {
	// Found by codex. The parsed scope changed the DISPLAY but not the claimed-twice check,
	// which still consulted the hardcoded set - so a register that spells out `repo-local` was
	// overruled by a Set containing exactly `FIX`.
	const dir = tmpdir();
	fs.mkdirSync(path.join(dir, 'docs', 'project'), { recursive: true });
	const reg = '| Prefix | Scope | Owner | Last Used | Series |\n| --- | --- | --- | --- | --- |\n| PQ | repo-local | x | PQ-1 | local fixes |\n';
	fs.writeFileSync(path.join(dir, 'docs', 'project', 'A_Roadmap.md'), reg);
	fs.writeFileSync(path.join(dir, 'docs', 'project', 'B_Roadmap.md'), reg);
	assert.deepStrictEqual(contestedPrefixes(dir), [],
		'two roadmaps declaring PQ repo-local is intended, not a collision');
});

test('[docs] the Reference lists every default planning-surface glob', () => {
	// Found by codex: two globs were added to DEFAULT_ROADMAPS and the documented default was
	// not updated, so a reader copying it would silently drop nested-roadmap coverage. Derived
	// from the code rather than restated, so it cannot drift again.
	const ref = fs.readFileSync(path.join(__dirname, '..', 'docs', 'Reference.md'), 'utf8');
	for (const glob of DEFAULT_ROADMAPS) {
		assert.ok(ref.includes(glob), `Reference.md does not document the default glob ${glob}`);
	}
});

test('[series] a numbered backlog item DECLARES, and the roadmap glob reaches it', () => {
	// Measured on MedAR_AI_Runtime: a backlog written as "3. `VS-07` - definition" is not a table,
	// so every first-column extractor in that estate returned zero for it. Four IDs minted there
	// collided with another repository and were invisible to all of them.
	const dir = backlogRepo(
		`${OWNS_VS}\n| ID | Slice |\n| --- | --- |\n| VS-4 | in the index |\n`,
		'## Ordered Backlog\n\n1. `VS-07` - GPU allocation validation\n2. `VS-13` - speculative decoding\n');
	assert.strictEqual(lastNumber(dir, 'VS'), 13);
});

test('[series] a bulleted item that DEFINES an ID counts, using a dash or a colon', () => {
	const dash = backlogRepo(`${OWNS_VS}\n`, '- `VS-21` - a defined thing\n');
	assert.strictEqual(lastNumber(dash, 'VS'), 21);
	const colon = backlogRepo(`${OWNS_VS}\n`, '- `VS-22`: a defined thing\n');
	assert.strictEqual(lastNumber(colon, 'VS'), 22);
});

test('[series] a list item that CITES an ID mid-sentence does not declare it', () => {
	// The separator after the ID is the whole defence. Without it, a roadmap Notes section
	// bulleting a sibling repository's slice would register as a mint of a prefix this roadmap
	// does not own, and `series` would fail on an undeclared prefix nobody minted.
	const dir = backlogRepo(`${OWNS_VS}\n`,
		'- see VS-999 for the background\n- blocked until VS-998 lands\n1. depends on VS-997 shipping\n');
	assert.strictEqual(lastNumber(dir, 'VS'), 0);
});

test('[series] a rename annotation in a DECLARING position hides the ID completely', () => {
	// Measured while planning a real cross-repo renumber. The migration convention "AIR-19 (was
	// VS-19)" is good practice in PROSE and catastrophic in an ID cell: the ID is not misparsed,
	// it DISAPPEARS - from the series check, the collision scan and the last-used number alike.
	// The renumber intended to end an invisibility bug would have introduced a worse one.
	//
	// This test documents the behaviour rather than fixing it, deliberately. Making the parser
	// tolerant of trailing text in a declaring position would readmit exactly the prose the
	// position exists to exclude. The annotation belongs in the Status cell; see DT-27 for making
	// the silent drop loud.
	const annotated = roadmapRepo(`${OWNS_VS}\n| ID | Slice |\n| --- | --- |\n| VS-19 (was VS-9) | a thing |\n`);
	assert.strictEqual(lastNumber(annotated, 'VS'), 0, 'an annotated ID cell parses as NOTHING');

	const clean = roadmapRepo(`${OWNS_VS}\n| ID | Slice | Notes |\n| --- | --- | --- |\n| VS-19 | a thing | was VS-9 |\n`);
	assert.strictEqual(lastNumber(clean, 'VS'), 19, 'the same fact in the Notes cell is fine');
});

test('[series] declaredIds returns the whole SET, not the maximum', () => {
	// `series` needs the max to mint the next ID; a cross-repo collision check needs every member,
	// because two repositories can collide on any of them and usually not on the highest.
	const dir = roadmapRepo(`${OWNS_VS}\n| ID | Slice |\n| --- | --- |\n| VS-3 | a |\n| VS-9 | b |\n`);
	const ids = declaredIds(path.join(dir, 'docs', 'project', 'X_Development_Roadmap.md'));
	assert.deepStrictEqual([...ids.keys()].sort(), ['VS-3', 'VS-9']);
});

test('[series] declaredIds keys by NUMBER, so VS-01 and VS-1 are one ID', () => {
	// Padding is a rendering rule and must never reach identity. A collision check comparing the
	// text as written would miss exactly the pairs a padding convention was introduced to tidy.
	const dir = roadmapRepo(`${OWNS_VS}\n| ID | Slice |\n| --- | --- |\n| VS-01 | a |\n| VS-1 | same slice |\n`);
	const ids = declaredIds(path.join(dir, 'docs', 'project', 'X_Development_Roadmap.md'));
	assert.deepStrictEqual([...ids.keys()], ['VS-1']);
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
// Slice extraction. This module destroyed content three separate ways before it had any tests, and
// every one of them was silent, so the regression tests below are the point of it rather than a
// formality. The property that matters is CONTAINMENT: every word of the roadmap must survive
// somewhere in the output. Assert it directly.

const ROADMAP = [
	'# Roadmap',
	'',
	'## Delivery Index',
	'',
	'### Vertical Slices',
	'',
	'| ID | State | Slice | Est | Priority | Lane | Status |',
	'| --- | --- | --- | --- | --- | --- | --- |',
	'| VS-371 | planned | Schema | 1d | High | SQL | Added 2026-08-08. Wilson said so. |',
	'| VS-372 | planned | Engine | 2d | High | Daemon | Precedence is operator-authored. |',
	'| VS-400 | planned | Escaped | 1d | Low | Tools | It `\\|`-joined the store list into one argv. |',
	'| VS-401 | planned | CodeSpan | 1d | Low | UI | Now reads `DSET SFE \| unresolved` in the tooltip. |',
	'| VS-273 | planned | Reject | 1d | High | Workflow | The reject dialog. |',
	'| FIX-89 | planned | Mixup | 1d | High | SQL | The join was wrong. |',
	'',
	'## Slice Notes (Narrative)',
	'',
	'### VS-371 through VS-372 (MedFM Billing Rules Engine)',
	'',
	'The engine evaluates rules in operator order.',
	'',
	'### VS-273 — Reject-path mechanics',
	'',
	'Measured against fn_CalcStatus.',
	'',
	'### FIX-89 — the join that paired the wrong rows',
	'',
	'An INNER JOIN on RowNum mispaired the entries.',
	'',
	'### VS-273 / FIX-89 — the target model, and the one measured constraint',
	'',
	'Once every database runs through SXCoder, bolt a new overflow table on.',
	'',
].join('\n');

/** Every word of the source must appear somewhere in the output. No parsing, so it cannot self-validate. */
function assertLossless(source, result) {
	const words = (t) => t.split(/\s+/).map((w) => w.trim()).filter((w) => w.length > 3);
	const all = result.text + '\n' + result.docs.map((d) => d.content).join('\n');
	// Substring, not token equality. Markdown glues words to punctuation - a heading that becomes a
	// link renders "Engine)](slices/..)" - so a token-set check reports loss that did not happen,
	// and a checker that cries wolf is worse than no checker.
	const missing = [...new Set(words(source))].filter((w) => !all.includes(w));
	assert.deepStrictEqual(missing, [], `content lost: ${[...new Set(missing)].slice(0, 8).join(' | ')}`);
}

test('[slices] nothing is lost - every word survives somewhere', () => {
	assertLossless(ROADMAP, extractSlices(ROADMAP));
});

test('[slices] an escaped pipe is a literal, not a column boundary', () => {
	// 504 rows in the real roadmap contain one. Splitting on it finds phantom columns, so the "last
	// cell" is a fragment from the middle and rewriting it corrupts the row.
	const r = extractSlices(ROADMAP);
	const doc = r.docs.find((d) => d.content.includes('VS-00400'));
	assert.ok(doc.content.includes('joined the store list into one argv'),
		'the whole Status cell must reach the document, not just the tail after the escaped pipe');
});

test('[slices] an UNescaped pipe inside a code span does not truncate the row', () => {
	// The author wrote `DSET SFE | unresolved`. Escaping alone does not save this; the column COUNT
	// from the header does, because the last column simply keeps every pipe it contains.
	const r = extractSlices(ROADMAP);
	const doc = r.docs.find((d) => d.content.includes('VS-00401'));

	// Assert the WHOLE cell arrived. Checking only the tail passes even when the split is broken,
	// because the tail is precisely the fragment a naive split keeps - the front half is what gets
	// stranded in the row. A test that inspects the surviving half cannot see the missing one.
	assert.ok(doc.content.includes('Now reads `DSET SFE | unresolved` in the tooltip.'),
		'the entire Status cell must reach the document, pipes and all');

	// And the row must be thin afterwards. Containment alone is satisfied by prose that never moved.
	const row = r.text.split('\n').find((l) => l.startsWith('| VS-401 |'));
	assert.ok(!row.includes('Now reads'),
		'the prose is still in the row, so it was pinned but never actually moved');
});

test('[slices] a row is pinned to its document exactly once, and keeps its other columns', () => {
	const r = extractSlices(ROADMAP);
	const row = r.text.split('\n').find((l) => l.startsWith('| VS-371 |'));
	assert.match(row, /See \[slice notes\]\(slices\/VS-00371_[^)]+\)/);
	for (const cell of ['planned', 'Schema', '1d', 'High', 'SQL']) {
		assert.ok(row.includes(cell), `pinning the row dropped the ${cell} column`);
	}
	assert.ok(!row.includes('Wilson said so'), 'the prose should have MOVED, not been copied');
});

test('[slices] a later section revisiting claimed slices is appended, never deleted', () => {
	// `### VS-273 / FIX-89` names IDs an earlier section already claimed. The group then has no
	// members, is skipped before it is assigned a filename, and the splice still removes it - which
	// deleted the prose and left a link to slices/undefined.
	const r = extractSlices(ROADMAP);
	assert.ok(!r.text.includes('slices/undefined'), 'a dangling link means a section was dropped');
	const doc = r.docs.find((d) => d.content.includes('Measured against fn_CalcStatus'));
	assert.ok(doc, 'the VS-273 document should exist');
	assert.ok(doc.content.includes('bolt a new overflow table'),
		'the revisiting section must be appended to the document that owns the IDs');
});

test('[slices] a range heading claims every slice in the range', () => {
	const r = extractSlices(ROADMAP);
	const doc = r.docs.find((d) => d.file.startsWith('VS-00371_'));
	assert.ok(doc.ids.includes('VS-00371') && doc.ids.includes('VS-00372'),
		'VS-371 through VS-372 is two slices in one document');
});

test('[slices] evidence is gathered but never asserted as completion', () => {
	const status = 'statusDetails:\n  - accomplishments:\n    - "[VS-371] shipped the schema"\n';
	const r = extractSlices(ROADMAP, { statusText: status });
	const doc = r.docs.find((d) => d.file.startsWith('VS-00371_'));
	assert.ok(doc.content.includes('shipped the schema'));
	assert.ok(/not\*\* a judgement that the slice is complete/.test(doc.content),
		'the document must say plainly that evidence is not a completion claim');
});

test('[slices] the summary one-liner is NOT invented', () => {
	// The whole point of pinning rather than summarising: a generated one-liner reads like a decision
	// and is not one. If this ever starts writing summaries, it must be a deliberate change.
	const r = extractSlices(ROADMAP);
	for (const d of r.docs) {
		assert.ok(/has deliberately not been written/.test(d.content),
			`${d.file} lost the notice that the summary is still owed`);
	}
});


// ---------------------------------------------------------------------------
// Unescaped pipes in table cells. Not carelessness - a generator keeps producing them, and Wilson
// has been repairing them by hand for months. That is the arrangement this toolkit exists to end.

const TBL = [
	'| ID | State | Notes |',
	'| --- | --- | --- |',
	'| VS-1 | ok | plain prose, no pipes |',
	'| VS-2 | ok | escaped `demo' + String.fromCharCode(92) + '|bill` is a literal |',
	'| VS-3 | bad | bare `DSET SFE | resolved` splits the row |',
].join('\n');

test('[tables] a bare pipe in a cell is reported', () => {
	const p = checkTable(TBL, 'r.md');
	assert.strictEqual(p.length, 1, 'exactly the VS-3 row is wrong');
	assert.strictEqual(p[0].line, 5);
	assert.strictEqual(p[0].extra, 1);
});

test('[tables] an ESCAPED pipe is not reported', () => {
	// The whole point: `\|` is legal and common. Flagging it would train people to ignore the check.
	const p = checkTable(TBL, 'r.md');
	assert.ok(!p.some((x) => x.line === 4), 'an escaped pipe is correct markdown, not a problem');
});

test('[tables] the report points near the offending pipe, not at the row', () => {
	// A row can be 14,000 characters long. "This row is wrong" is not actionable at that size.
	const p = checkTable(TBL, 'r.md');
	assert.ok(p[0].near.length < 120, 'the excerpt must stay readable');
	assert.ok(p[0].near.includes('|'), 'and must actually show the pipe');
});

test('[tables] a table with no recognised header is not guessed at', () => {
	// Without a header there is no reference for the column count, and inventing one would produce
	// confident nonsense on every prose table in the repository.
	const p = checkTable('| a | b |\n| --- | --- |\n| x | y | z |\n', 'r.md');
	assert.deepStrictEqual(p, []);
});


// ---------------------------------------------------------------------------

console.log(`\n${passed} passing, ${failed} failing\n`);
process.exit(failed ? 1 : 0);
