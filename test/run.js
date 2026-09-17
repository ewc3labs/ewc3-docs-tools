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
const { extractSlices, parseIndex, padId } = require('../lib/slices');
const { checkTable } = require('../lib/tables');
const { readSeries, lastNumber, undeclaredPrefixes, declaredOwnership,
	isLocalPrefix, roadmapFiles, declaredIds, frozenViolations, contestedPrefixes,
	withoutFences, DEFAULT_ROADMAPS } = require('../lib/series');
const frontmatter = require('../lib/frontmatter');
const { renderIndex, detectWidth, detectWidths } = require('../lib/deliveryindex');

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

test('a reference DEFINITION inside fenced code is an example, not a definition to relocate', () => {
	// The test above was named for this guarantee and passed the whole time it was broken. It fences
	// an INLINE link, which the wrapper already skipped. It never fenced a DEFINITION line - and the
	// definition paths harvest and strip by their own set, which fences were not in. So an example
	// was lifted out of its block, lost its trailing annotation, and came back at the foot as a live
	// link, leaving an empty fence. `DOCS-051` lost two illustrations that way. A guarantee is only
	// as good as the path it exercises.
	const example = [
		'```',
		'[twin]:   ../../../../elsewhere/docs/X.md   <- the relative half',
		'[twin-2]: https://github.com/org/elsewhere/blob/main/docs/X.md',
		'```',
	].join('\n');
	const src = `# Example\n\nProse before.\n\n${example}\n\nProse after.\n`;
	const out = format(src);

	assert.ok(out.includes(example), 'the fenced example must survive byte for byte');
	assert.ok(!/^\[twin(-2)?\]: /m.test(out.split(example).join('')),
		'and must not ALSO appear outside the fence as a live definition');

	// The ordinary behaviour must still happen next to it: a long link in prose still moves.
	const mixed = `${example}\n\nSee [a long link](https://example.com/a-long-enough-url-to-be-harvested).\n`;
	const moved = format(mixed);
	assert.ok(moved.includes(example), 'fence still intact beside real harvesting');
	assert.match(moved, /^\[a-long-link\]: https:\/\/example\.com\//m, 'the prose link still relocates');
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

// DOCS-051. A repo sits inside an OUTER directory so a cross-repo relative link has somewhere to point.
function crossRepo(markdown, { siblingExists = false } = {}) {
	const outer = tmpdir();
	const repo = path.join(outer, 'this-repo');
	fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
	if (siblingExists) {
		fs.mkdirSync(path.join(outer, 'Programs_MedAR', 'DevTools', 'docs'), { recursive: true });
		fs.writeFileSync(path.join(outer, 'Programs_MedAR', 'DevTools', 'docs', 'X.md'), '# X\n');
	}
	fs.writeFileSync(path.join(repo, 'docs', 'a.md'), markdown);
	return checkLinks(repo, { orphanRoot: 'nope' });
}

test('[links] a cross-repo link WITH a GitHub twin is counted, not failed', () => {
	const r = crossRepo('See [x][x].\n\n'
		+ '[x]: ../../Programs_MedAR/DevTools/docs/X.md\n'
		+ '[x-2]: https://github.com/MedARMS/DevTools/blob/main/docs/X.md\n');
	assert.deepStrictEqual(r.problems, [], 'a correct twin pair is clean from a single-repo checkout');
	assert.strictEqual(r.unverified, 1, 'and it is COUNTED as unverified rather than silently passed');
});

test('[links] a twin matches on repository NAME, never on the local folder above it', () => {
	// `Programs_MedAR` is where this machine keeps the repo; `MedARMS` is who owns it on GitHub.
	// An owner comparison would fail every correct MedAR twin in the estate.
	const r = crossRepo('[x]: ../../Programs_MedAR/DevTools/docs/X.md\n'
		+ '[x-2]: https://github.com/MedARMS/DevTools/blob/main/docs/X.md\n');
	assert.deepStrictEqual(r.problems, []);
});

test('[links] a cross-repo link with NO twin fails, and names why', () => {
	const r = crossRepo('[x]: ../../Programs_MedAR/DevTools/docs/X.md\n');
	assert.strictEqual(r.problems.length, 1);
	assert.match(r.problems[0].why, /no GitHub twin/);
});

test('[links] a twin that names a different repository or path is DRIFT, not a pass', () => {
	const r = crossRepo('[x]: ../../Programs_MedAR/DevTools/docs/X.md\n'
		+ '[x-2]: https://github.com/MedARMS/SomethingElse/blob/main/docs/X.md\n');
	assert.strictEqual(r.problems.length, 1);
	assert.match(r.problems[0].why, /different repository or path/);
});

test('[links] the verdict is UNCONDITIONAL: a sibling on disk changes nothing', () => {
	// The whole point. Resolving the link when the sibling happens to be cloned and skipping it when it
	// is not would give one link two verdicts depending on whose machine asks. Measured across a
	// worktree, a sibling-present layout and an empty CI checkout before this test was written; this
	// pins it. The sibling EXISTS here, and a twin-less link must still fail - and a twinned one must
	// still be counted rather than resolved.
	const noTwin = '[x]: ../../Programs_MedAR/DevTools/docs/X.md\n';
	const absent = crossRepo(noTwin);
	const present = crossRepo(noTwin, { siblingExists: true });
	assert.deepStrictEqual(present.problems.map((p) => p.why), absent.problems.map((p) => p.why),
		'the same link must get the same verdict whether or not the sibling is on disk');
	assert.strictEqual(present.unverified, 1, 'never resolved, even though it would have resolved');
});

test('ignores links inside code fences', () => {
	const dir = tmpdir();
	fs.writeFileSync(path.join(dir, 'a.md'), '```\n[x](does-not-exist.md)\n```\n');
	const { problems } = checkLinks(dir, { orphanRoot: 'nope' });
	assert.deepStrictEqual(problems, []);
});

// A LONGER FENCE HOLDING A SHORTER ONE - how a document shows what a fence looks like. Codex on PR #5.
// Five places tracked a fence by its first three characters, so the inner ``` closed the outer block
// and everything after it was treated as live prose. One grammar now, in lib/fence.js.
const FOUR = '````';
const NESTED = [`${FOUR}md`, '```', '[x]:   ../../a.md   <- an example definition', '```', FOUR].join('\n');

test('[fence] the grammar: same character, at least as long, nothing else on the line', () => {
	const { fenceOpener, closesFence, fencedLineSet } = require('../lib/fence');
	assert.strictEqual(fenceOpener('```js'), '```', 'an info string is allowed');
	assert.strictEqual(fenceOpener('````md'), '````', 'the WHOLE run is kept, not three characters');
	assert.strictEqual(fenceOpener('~~~'), '~~~');
	assert.strictEqual(fenceOpener('``` `inline` ```'), null, 'a backtick in a backtick info string is inline code');

	assert.ok(closesFence('````', '````'));
	assert.ok(closesFence('`````', '````'), 'a longer run still closes');
	assert.ok(!closesFence('```', '````'), 'a SHORTER run does not close - the bug Codex found');
	assert.ok(!closesFence('~~~~', '````'), 'the other character does not close');
	assert.ok(!closesFence('```js', '```'), 'a line with an info string opens, it does not close');

	const lines = ['a', '```', 'b', 'c'];
	assert.deepStrictEqual([...fencedLineSet(lines)], [1, 2, 3], 'an unclosed fence runs to the end');
});

test('[fence] format: a shorter fence inside a longer one does not close it', () => {
	const src = `# T\n\nProse before.\n\n${NESTED}\n\nProse after.\n`;
	const out = format(src);
	assert.ok(out.includes(NESTED), 'the nested example must survive byte for byte');
	assert.ok(!/^\[x\]: /m.test(out.split(NESTED).join('')), 'and not be relocated out of it');
});

test('[fence] a fence inside a BLOCK QUOTE is still a fence', () => {
	// A REGRESSION this PR introduced, found by Codex's fifth pass. The old lazy regex in links matched
	// ``` anywhere on a line, so a fence inside `> ` was stripped. lib/fence.js required the delimiter at
	// the start of the line after whitespace, and `>` is not whitespace - so a block-quoted example
	// link was checked as live. On main this reports nothing; on the branch it reported the example.
	// Measured in the estate: ewc3labs-hq has 8 block-quoted fence lines, excel-power-query-editor 2.
	const dir = tmpdir();
	fs.writeFileSync(path.join(dir, 'q.md'), '> ```md\n> [example](missing.md)\n> ```\n');
	assert.deepStrictEqual(checkLinks(dir, { orphanRoot: 'nope' }).problems, [], 'links ignores the quoted example');

	const nested = '> > ```md\n> > [example](missing.md)\n> > ```\n';
	fs.writeFileSync(path.join(dir, 'q.md'), nested);
	assert.deepStrictEqual(checkLinks(dir, { orphanRoot: 'nope' }).problems, [], 'and a nested quote too');

	const marker = '> ```md\n> <!--ewc3:tests-->1<!--/ewc3:tests-->\n> ```\n';
	assert.strictEqual(applyToText(marker, { tests: 136 }).text, marker, 'values leaves a quoted example marker alone');
});

test('[fence] values: a marker inside a longer fence is still documentation', () => {
	const src = `${FOUR}md\n\`\`\`\n<!--ewc3:tests-->1<!--/ewc3:tests-->\n\`\`\`\n${FOUR}\n`;
	const r = applyToText(src, { tests: 136 });
	assert.strictEqual(r.text, src, 'the example marker must not be substituted');
});

test('[fence] links: a link inside a longer fence is not checked', () => {
	const dir = tmpdir();
	fs.writeFileSync(path.join(dir, 'a.md'), `${FOUR}md\n\`\`\`\n[x](does-not-exist.md)\n\`\`\`\n${FOUR}\n`);
	assert.deepStrictEqual(checkLinks(dir, { orphanRoot: 'nope' }).problems, []);
});

test('[format] a file with NO trailing newline does not crash', () => {
	// Removing splitBlocks' fence variable left one reference behind, in the branch that flushes a
	// final prose buffer - reached only when a file does not end in a newline. Every test input and
	// every document in this repository ends in one, so the suite and CI both passed while
	// `format('plain text')` threw ReferenceError. Codex on PR #5. A crash on valid input aborts both
	// `fix` and `check` for anyone whose files lack a final newline.
	assert.strictEqual(format('plain text'), 'plain text\n');
	assert.strictEqual(format('# Heading\n\nlast paragraph, no newline'), '# Heading\n\nlast paragraph, no newline\n');
});

test('[fence] an UNCLOSED opener indented four spaces is indented code, not a fence to the end', () => {
	// `    ~~~` in an indented-code example opened an unclosed fence, blankFences erased the rest of the
	// document, and a real link below it was never checked. Codex on PR #5.
	const dir = tmpdir();
	fs.writeFileSync(path.join(dir, 'a.md'), 'Indented code:\n\n    ~~~\n    example\n\nThen [a real link](missing.md).\n');
	const r = checkLinks(dir, { orphanRoot: 'nope' });
	assert.strictEqual(r.problems.length, 1, 'the dead link after the indented example must still be found');
	assert.match(r.problems[0].target, /missing\.md/);
});

test('[fence] an UNCLOSED list-nested fence is protected by format and values', () => {
	// Codex's fourth pass, and the direct counterpart of the test above: the look-ahead rule made an
	// unclosed four-space opener "indented code", so an unclosed fence under a list item had its
	// example joined into prose and its example marker substituted. The two cases cannot be told apart
	// without a list-container parser - so each consumer takes its OWN safe default. For format and
	// values that is to protect: verbatim cannot corrupt anything.
	const src = '- Example:\n\n    ```md\n    [x]:   ../../a.md   <- an example definition\n'
		+ '    <!--ewc3:tests-->1<!--/ewc3:tests-->\n';
	const out = format(src);
	assert.ok(out.includes('    [x]:   ../../a.md   <- an example definition'), 'format keeps the example verbatim');
	assert.ok(!/^\[x\]: /m.test(out), 'and does not relocate it');
	assert.strictEqual(applyToText(src, { tests: 136 }).text, src, 'values does not substitute the example marker');
});

test('[fence] a CLOSED fence nested in a list item is still protected', () => {
	// The regression the obvious fix would cause. CommonMark measures a fence's indent from its list
	// item's content, so list-nested fences sit four or more spaces in - and capping every opener at
	// three spaces would turn their contents back into prose, reopening DOCS-061 for exactly those.
	const block = ['- a step:', '', '    ```', '    [x]:   ../../a.md   <- example', '    ```'].join('\n');
	const out = format(`# T\n\n${block}\n\nProse after.\n`);
	assert.ok(out.includes(block), 'a list-nested closed fence keeps its example');
	assert.ok(!/^\[x\]: /m.test(out.split(block).join('')), 'and nothing is relocated out of it');
});

test('[links] a twin path must match in CASE - GitHub paths are case-sensitive', () => {
	// Both halves were lowercased before comparing, so `docs/X.md` beside a URL ending `docs/x.md`
	// passed while the web link was broken - the wrong-case defect `links` catches everywhere else.
	// The REPOSITORY name is still compared without case: a local folder may be `devtools` for a
	// repository named `DevTools`, and GitHub resolves repository names either way. Codex on PR #5.
	const wrongCase = crossRepo('[x]: ../../Programs_MedAR/DevTools/docs/X.md\n'
		+ '[x-2]: https://github.com/MedARMS/DevTools/blob/main/docs/x.md\n');
	assert.strictEqual(wrongCase.problems.length, 1, 'a path differing only in case is not a twin');

	const repoCase = crossRepo('[x]: ../../Programs_MedAR/devtools/docs/X.md\n'
		+ '[x-2]: https://github.com/MedARMS/DevTools/blob/main/docs/X.md\n');
	assert.deepStrictEqual(repoCase.problems, [], 'but the repository NAME may differ in case');
});

test('[links] a file whose name starts with two dots is INSIDE the repository', () => {
	// "Does this leave the repo" was a string prefix test on the relative path, so `..config.md` at the
	// root read as outside it and failed for lacking a GitHub twin. Codex on PR #5.
	const dir = tmpdir();
	fs.writeFileSync(path.join(dir, '..config.md'), '# config\n');
	fs.writeFileSync(path.join(dir, 'a.md'), 'See [config](..config.md).\n');
	const r = checkLinks(dir, { orphanRoot: 'nope' });
	assert.deepStrictEqual(r.problems, [], 'checked on disk, not treated as cross-repo');
	assert.strictEqual(r.unverified, 0);
});

test('[links] success never says an unresolved link resolved', () => {
	// The run printed "N cross-repo link(s) ... not resolved" and then "All of them resolve", in the
	// same output - a false, self-contradicting assurance in CI. Codex on PR #5.
	const outer = tmpdir();
	const repo = path.join(outer, 'this-repo');
	fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
	fs.writeFileSync(path.join(repo, 'README.md'), 'See [a](docs/a.md).\n');
	fs.writeFileSync(path.join(repo, 'docs', 'a.md'), 'See [x][x].\n\n'
		+ '[x]: ../../Programs_MedAR/DevTools/docs/X.md\n'
		+ '[x-2]: https://github.com/MedARMS/DevTools/blob/main/docs/X.md\n');
	const r = require('child_process').spawnSync(process.execPath,
		[path.join(__dirname, '..', 'bin', 'ewc3-docs.js'), 'links'], { cwd: repo, encoding: 'utf8' });
	const out = (r.stdout || '') + (r.stderr || '');
	assert.strictEqual(r.status, 0, `a clean run should pass:\n${out}`);
	assert.match(out, /cross-repo/, 'the twin-checked links are reported');
	assert.doesNotMatch(out, /All of them resolve/, 'and the summary must not claim they resolved');
});

test('[links] twins compare DECODED paths, without a fragment', () => {
	// The relative half is decoded and its #fragment dropped before it resolves; the GitHub half was
	// compared raw, so identical twins read as having none. Codex on PR #5.
	const encoded = crossRepo('[x]: ../../Programs_MedAR/DevTools/docs/My%20File.md\n'
		+ '[x-2]: https://github.com/MedARMS/DevTools/blob/main/docs/My%20File.md\n');
	assert.deepStrictEqual(encoded.problems, [], 'an encoded filename is the same file');

	const fragment = crossRepo('[x]: ../../Programs_MedAR/DevTools/docs/X.md\n'
		+ '[x-2]: https://github.com/MedARMS/DevTools/blob/main/docs/X.md#a-heading\n');
	assert.deepStrictEqual(fragment.problems, [], 'a heading anchor does not change which file');
});

test('[links] a GitHub twin written as an INLINE link still counts', () => {
	// Twins were collected only from reference definitions, so `[🔗](https://github.com/...)` was
	// invisible and its relative half failed. `links` runs independently of `format`, which is what
	// would otherwise have moved it into a definition. Codex on PR #5.
	const r = crossRepo('[x]: ../../Programs_MedAR/DevTools/docs/X.md\n\n'
		+ 'See [🔗](https://github.com/MedARMS/DevTools/blob/main/docs/X.md).\n');
	assert.deepStrictEqual(r.problems, []);
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
	assert.strictEqual(body, '\n# The narrative\n',
		'the body starts where it starts - read() consumes only the fence terminator');
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
	assert.strictEqual(lastNumber(range, 'VS'), 26,
		'a range declares EVERY id in it - this assertion expected 25 and PINNED the bug');
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

test('[frontmatter] the round-trip is checked through PARSE, not through scalar()', () => {
	// The previous version of this rule tested candidates against `scalar()` and called that "the
	// round-trip, so it cannot drift from the parser". It could, because `scalar` IS NOT the parser.
	// Codex found three ways past it in one round, all parse-level behaviour scalar never sees.
	// `write` is a fold rewriting frontmatter it did not author, so each one corrupts a field
	// nobody was editing.
	const cases = [
		['*important', 'an anchor sigil - re-read THREW'],
		['[draft]', 'bracket text - silently retyped as a one-element list'],
		['Say "go" #4', 'quote plus comment-hash - escapes were not decoded back'],
		['|', 'a bare block-scalar marker'],
		['# leading hash', 'reads as a comment line'],
	];
	for (const [value, why] of cases) {
		const doc = '---\nid: VS-1\nstate: planned\n---\n\n# body\n';
		const data = frontmatter.read(doc).data;
		data.title = value;
		data.state = 'coded';
		const back = frontmatter.read(frontmatter.write(doc, data)).data;
		assert.strictEqual(back.title, value, `title corrupted (${why})`);
		assert.strictEqual(back.state, 'coded', 'and the field being edited still lands');
	}
});

test('[frontmatter] a comma inside a list element does not change cardinality', () => {
	// Found by codex: `[alpha,beta]` re-read as TWO elements, so an unrelated frontmatter update
	// silently changed the size of a dependency list.
	const doc = '---\ntags: []\n---\n';
	const d = frontmatter.read(doc).data;
	d.tags = ['alpha,beta', 'gamma'];
	const back = frontmatter.read(frontmatter.write(doc, d)).data;
	assert.deepStrictEqual(back.tags, ['alpha,beta', 'gamma']);
});

test('[frontmatter] a value the subset cannot represent is REFUSED, not mangled', () => {
	// Silently mangling is the one outcome worse than failing.
	assert.throws(() => frontmatter.field('title', 'a\nnewline'), /cannot represent/);
});

test('[series] an HTML-commented row does not declare', () => {
	// Found by codex. A commented-out table row is invisible in rendered markdown, so it is not a
	// mint - but it read as one, and could advance the derived next ID.
	const dir = roadmapRepo(`${OWNS_VS}\n| ID | Slice |\n| --- | --- |\n| VS-3 | real |\n`
		+ '\n<!--\n| VS-999 | disabled, commented out |\n-->\n');
	assert.strictEqual(lastNumber(dir, 'VS'), 3, 'a commented row must not move the series');
});

test('[series] a closing fence may be followed only by whitespace', () => {
	// Found by codex. ```js inside a block is an info string on a nested example, not a close -
	// and closing on it exposed the rows beneath to the declaration scanner.
	const out = withoutFences(['a', '```', '```js', '| VS-888 | exposed |', '```', 'b'].join('\n'));
	assert.ok(!out.includes('VS-888'), 'an info-string line is content, not a closing fence');
	assert.strictEqual(out.split('\n').length, 6);
});

test('[series] a ranged heading records EVERY id, not just the first', () => {
	// Found by codex, which also noted that my own regression test CONFIRMED the defect rather
	// than fixing it: `VS-25 through VS-26` asserted 25. Capturing only the leading ID meant a
	// ranged heading declared one of five, so `lastNumber` could hand out a taken number and the
	// collision check could not see the rest.
	//
	// Fixed by making slices.js parseHeading the single enumerator - it already expanded ranges.
	// TWO heading parsers that disagreed is what produced this, and it was flagged twice before
	// it cost anything.
	const dir = roadmapRepo(`${OWNS_VS}\n### VS-371 through VS-375 — a family\n`);
	const ids = [...declaredIds(path.join(dir, 'docs', 'project', 'X_Development_Roadmap.md')).keys()];
	assert.deepStrictEqual(ids, ['VS-371', 'VS-372', 'VS-373', 'VS-374', 'VS-375']);
	assert.strictEqual(lastNumber(dir, 'VS'), 375, 'so the next mint cannot collide with 375');
});

test('[series] an HTML comment that opens AFTER prose still hides what follows', () => {
	// Found by codex as fresh evidence against the earlier HTML-comment fix: `startsWith` missed
	// `prose <!--`, so the rows beneath were scanned as real declarations.
	const out = withoutFences('prose <!--\n| VS-999 | hidden |\n-->');
	assert.ok(!out.includes('VS-999'), 'a mid-line opener still enters comment mode');
	assert.ok(out.startsWith('prose'), 'and the text before it, which renders, is kept');
});

test('[series] a BACKTICKED comment delimiter is documentation, not markup', () => {
	// Found while fixing the above, by investigating a real failure rather than a report - and it
	// is the most on-theme defect of the branch. This repository's own roadmap row for DT-9
	// DESCRIBES the wrapped-`<!--` hazard, in backticks. The first version of the comment fix read
	// that row as an unterminated opener and swallowed every row beneath it, deleting FIX-1 from
	// the series. The row documenting the trap sprang the trap.
	//
	// Same lesson as DT-10, which taught `values` to ignore markers inside code spans. It did not
	// carry to the comment scanner either.
	const dir = roadmapRepo(`${OWNS_VS}\n| ID | Slice |\n| --- | --- |\n`
		+ '| VS-9 | a wrapped `<!--` becomes an HTML block the splitter freezes forever |\n'
		+ '| VS-12 | a later row that must survive |\n');
	assert.strictEqual(lastNumber(dir, 'VS'), 12,
		'a backticked <!-- must not open a comment and swallow the rows beneath');
});

test('[frontmatter] a block list may start after a comment', () => {
	// Found by codex. Examining only the immediate next line classified the field as null, and the
	// item beneath then threw "list item with no list to belong to" - on syntax the subset
	// advertises as supported.
	const doc = '---\ndepends_on:\n  # waiting on API\n  - VS-1\n---\n\n# body\n';
	assert.deepStrictEqual(frontmatter.read(doc).data.depends_on, ['VS-1']);
});

test('[frontmatter] a REMOVED list item cannot survive the fold', () => {
	// Found by codex, and the nastiest one yet: gathering a block list stopped at the first
	// non-item line, so a comment BETWEEN items truncated the region. Changing the field emitted
	// the new value and left the later items in place - [a, b] set to [x] read back as [x, b].
	// A dependency that will not die is the one failure a dependency graph cannot tolerate.
	const doc = ['---', 'tags:', '  - alpha', '  # a note between items', '  - beta', '---', '', '# body', ''].join('\n');
	const d = frontmatter.read(doc).data;
	assert.deepStrictEqual(d.tags, ['alpha', 'beta'], 'both items are read across the comment');
	d.tags = ['xray'];
	const back = frontmatter.read(frontmatter.write(doc, d)).data;
	assert.deepStrictEqual(back.tags, ['xray'], 'and beta is GONE');
});

test('[frontmatter] the closing fence must be a whole line, not a prefix', () => {
	// Found by codex: searching for the first `\n---` matched `---not-a-fence`, closed the block
	// early, and dropped the fields beneath into the body - where a rewrite re-fenced them in the
	// wrong place. Refusing is the correct outcome; silently re-shaping the document is not.
	const doc = '---\nid: VS-1\n---not-a-fence\nstate: planned\n---\n\n# body\n';
	assert.throws(() => frontmatter.read(doc), /not `key: value`/,
		'a malformed delimiter is refused, not treated as the close');

	const ok = '---\nid: VS-1\nstate: planned\n---\n\n# body\n';
	assert.strictEqual(frontmatter.read(ok).data.state, 'planned', 'a real fence still closes');
});

test('[frontmatter] a fold PATCHES the block - comments and blank lines survive', () => {
	// Found by codex. Rebuilding the block from key/value pairs deleted every explanatory comment
	// in the document, while the docstring promised unrelated fields were preserved.
	const doc = ['---', '# which slice this is', 'id: VS-1', 'state: planned   # the human judgement',
		'est: 4.0d', '---', '', '# body', ''].join('\n');
	const d = frontmatter.read(doc).data;
	d.state = 'coded';
	const out = frontmatter.write(doc, d);
	assert.ok(out.includes('# which slice this is'), 'a whole-line comment survives');
	assert.ok(out.includes('# the human judgement'), 'and so does a trailing one, on a CHANGED field');
	assert.ok(/state: coded\s+# the human judgement/.test(out), 'with its separating whitespace');
	assert.ok(out.includes('est: 4.0d'), 'and an untouched field is verbatim');
});

test('[frontmatter] an explicit empty string stays a string, not null', () => {
	// Found by codex: `title: ""` was emitted as `title:` and re-read as null - an unrelated fold
	// changing a field's TYPE.
	const doc = '---\nid: VS-1\ntitle: ""\n---\n\n# body\n';
	const back = frontmatter.read(frontmatter.write(doc, frontmatter.read(doc).data)).data;
	assert.strictEqual(back.title, '', 'still the empty STRING');
});

test('[frontmatter] the body is preserved byte-for-byte, blank lines included', () => {
	// Found by codex. read() stripped every leading blank line and write() added back exactly one,
	// so a state-only fold silently reflowed the document - against this function's own contract.
	const doc = '---\nid: VS-1\n---\n\n\n\n# body after three blanks\n';
	assert.strictEqual(frontmatter.write(doc, frontmatter.read(doc).data), doc,
		'an unchanged rewrite is byte-identical');
});

test('[series] a closing fence indented four spaces is content, not a close', () => {
	// Found by codex. Markdown allows a fence delimiter at most three spaces of indent; at four it
	// is code. Trimming before classifying made an over-indented run look like a valid close and
	// exposed the rows beneath it.
	const out = withoutFences(['a', '```', '    ```', '| VS-777 | inside |', '```', 'b'].join('\n'));
	assert.ok(!out.includes('VS-777'), 'a four-space-indented run does not close the fence');
});

test('[frontmatter] a value that would not survive plain is re-quoted on write', () => {
	// Found by codex, and it is the nastiest kind of bug: a fold updating only `state` would
	// silently truncate an unrelated TITLE. `title: "Fix the #4 lookup"` written back unquoted
	// re-reads as 'Fix the'. The round-trip IS the test, so the rule cannot drift from the parser.
	const doc = '---\ntitle: "Fix the #4 lookup"\nstate: planned\n---\n\n# body\n';
	const data = frontmatter.read(doc).data;
	data.state = 'coded';
	const out = frontmatter.write(doc, data);
	assert.strictEqual(frontmatter.read(out).data.title, 'Fix the #4 lookup',
		'the title must survive a write that was not about the title');

	const listDoc = '---\ntags: []\n---\n';
	const d2 = frontmatter.read(listDoc).data;
	d2.tags = ['plain', 'has # hash'];
	assert.deepStrictEqual(frontmatter.read(frontmatter.write(listDoc, d2)).data.tags,
		['plain', 'has # hash'], 'list items are quoted on the same rule');
});

// ---------------------------------------------------------------------------
// DOCS-066. GitHub renders frontmatter as YAML. `field()` chose plain output whenever THIS tool's lenient
// parser read the value back, so `doc: [VS-1](slices/x.md)` (a flow sequence to YAML) and `title: a: b`
// (a nested mapping) were written unquoted: every check passed, and GitHub showed an error box.

// Values strict YAML would reject, or read back as something other than the same string.
const YAML_UNSAFE = [
	'[VS-1](slices/x.md)', 'a: b', 'trailing:', 'has #hash', '`code` first', '*star', '&amp', '!bang', '|pipe',
	'>gt', '%pct', '@at', "'single", '"double', '#hash', '- dash', '-dash', '?q', ':colon', '{brace', '}close',
	']close', ',comma', ' leading space', 'trailing space ', '', 'true', 'False', 'yes', 'No', 'on', 'OFF', 'null',
	'~', '123', '-4.5', '0x1F', '1e3', '.inf', '2026-09-17', 'y', 'n',
];
// Values that are plain in strict YAML and read back as themselves.
const YAML_SAFE = ['DOCS-001', '🟦 tested', 'M', 'a plain title (with parens)', 'x:y', 'a#b', 'coded; smoked 09-09', 'VS-004a'];

test('[frontmatter] field quotes every value strict YAML would reject or retype', () => {
	for (const v of YAML_UNSAFE) {
		const line = frontmatter.field('title', v);
		const raw = line.slice('title:'.length).trim();
		assert.ok(/^".*"$/.test(raw), `${JSON.stringify(v)} must be quoted, got: ${line}`);
		assert.strictEqual(frontmatter.parse(line).title, v, `${JSON.stringify(v)} round-trips`);
	}
	for (const v of YAML_SAFE) {
		assert.strictEqual(frontmatter.field('title', v), `title: ${v}`, `${JSON.stringify(v)} stays plain`);
	}
});

test('[frontmatter] a list element that is not flow-safe in YAML is quoted', () => {
	assert.strictEqual(frontmatter.field('tags', ['alpha', 'beta']), 'tags: [alpha, beta]');
	for (const bad of ['a, b', 'x]', '[y', '{z}', 'k: v', 'true']) {
		const line = frontmatter.field('tags', ['alpha', bad]);
		assert.ok(line.includes(`"${bad}"`), `${JSON.stringify(bad)} quoted in ${line}`);
		assert.deepStrictEqual(frontmatter.parse(line).tags, ['alpha', bad]);
	}
});

test('[frontmatter] migrate writes strict-YAML-safe frontmatter', () => {
	// The doc pointer is the shape that broke every migrated document.
	const src = ['## Delivery Index', '', '| ID | State | Slice | Doc | Status |', '| --- | --- | --- | --- | --- |',
		'| VS-1 | coded | Title: with a colon | - | done |', ''].join('\n');
	const doc = extractSlices(src, { width: 0 }).docs.find((d) => d.ids.includes('VS-1'));
	const block = frontmatter.read(doc.content).block;
	assert.ok(/^doc: "\[VS-1\]\(slices\/[^"]+\)"$/m.test(block), block);
	assert.ok(/^title: "Title: with a colon"$/m.test(block), block);
});

test('[frontmatter] normalize re-quotes only unsafe lines, keeping comments, order and every safe line', () => {
	const { normalize } = frontmatter;
	const block = [
		'id: VS-1',
		'# a comment line',
		'title: a: b   # trailing note',
		"doc: '[VS-1](slices/x.md)'",
		'status: [VS-1](slices/y.md)',
		'tags: [alpha, beta]',
		'depends_on:',
		'  - VS-2',
		'  - x: y',
		'est: M',
	].join('\n');
	const out = normalize(block);
	assert.strictEqual(out, [
		'id: VS-1',
		'# a comment line',
		'title: "a: b"   # trailing note',
		"doc: '[VS-1](slices/x.md)'",
		'status: "[VS-1](slices/y.md)"',
		'tags: [alpha, beta]',
		'depends_on:',
		'  - VS-2',
		'  - "x: y"',
		'est: M',
	].join('\n'));
	assert.deepStrictEqual(frontmatter.parse(out), frontmatter.parse(block), 'values unchanged');
	assert.strictEqual(normalize(out), out, 'idempotent');
});

test('[frontmatter] repairing a list quotes only its unsafe elements; quoted and safe ones are kept as written', () => {
	// Copilot, PR #10: the list repair re-emitted EVERY element through `quoted`, so a list with one unsafe
	// element churned its already-quoted neighbours - single quotes became double, escapes were rewritten.
	const block = "tags: ['kept single', \"kept double\", plain, a: b]";
	const out = frontmatter.normalize(block);
	assert.strictEqual(out, "tags: ['kept single', \"kept double\", plain, \"a: b\"]");
	assert.deepStrictEqual(frontmatter.parse(out), frontmatter.parse(block));
});

test('[format] frontmatter ALREADY quoted - double or single - is never churned', () => {
	// A downstream repo re-quoted its unsafe values by hand before this fix, in both styles. `format --check`
	// on it must report nothing for frontmatter, or the repair becomes a second round of churn.
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yamlfm-'));
	const file = path.join(dir, 'VS-1_x.md');
	const text = [
		'---', 'id: VS-1', 'title: "Title: with a colon"', "status: 'a # not a comment'", 'doc: "[VS-1](slices/VS-1_x.md)"',
		"alt: '[VS-1](slices/VS-1_x.md)'", 'est: "3"', 'tags: ["a, b", \'[c]\']', '---', '', '# VS-1', '',
	].join('\n');
	fs.writeFileSync(file, text);
	const { formatFiles } = require('../lib/format');
	assert.deepStrictEqual(formatFiles([file], { check: true }), [], 'nothing to report');
	assert.strictEqual(frontmatter.normalize(frontmatter.read(text).block), frontmatter.read(text).block);
});

test('[format] normalizes unsafe frontmatter, and --check reports it; the body is untouched', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yamlfm-'));
	const file = path.join(dir, 'VS-1_x.md');
	const body = '\n# VS-1\n\nBody with title: text and [a](b.md).\n';
	fs.writeFileSync(file, '---\nid: VS-1\ndoc: [VS-1](slices/VS-1_x.md)\n---\n' + body);
	const { formatFiles } = require('../lib/format');
	assert.strictEqual(formatFiles([file], { check: true }).length, 1, '--check flags unsafe frontmatter');
	formatFiles([file], {});
	const text = fs.readFileSync(file, 'utf8');
	assert.ok(text.startsWith('---\nid: VS-1\ndoc: "[VS-1](slices/VS-1_x.md)"\n---\n'), text);
	assert.ok(text.endsWith(body), 'body byte-identical');
	assert.strictEqual(formatFiles([file], { check: true }).length, 0, 'clean after one pass');
});

test('[series] a longer fence is not closed by a shorter one inside it', () => {
	// Found by codex. A four-backtick block documenting a three-backtick example was closed by the
	// inner fence, so whatever followed leaked out and could be scanned as a mint - in a document
	// whose entire purpose is explaining fenced examples.
	const out = withoutFences(['a', '````', '```', '| VS-999 | inner |', '````', 'b'].join('\n'));
	assert.ok(!out.includes('VS-999'), 'the inner fence must not close the outer block');
	assert.strictEqual(out.split('\n').length, 6, 'and the line count is still preserved');
	assert.strictEqual(out.split('\n')[5], 'b');
});

test('[series] a freeze violation names the surface that MINTED, not the one that froze', () => {
	// Found by codex. Reporting the file that declared the freeze sends the reader to a document
	// that does not contain the offending ID - the wrong half of a two-file problem, with a message
	// asserting otherwise.
	const dir = backlogRepo(
		'| Prefix | Scope | Owner | Last Used | Series |\n| --- | --- | --- | --- | --- |\n| OPS | frozen at 8 | x | OPS-8 | retired |\n',
		'1. `OPS-9` - minted past the freeze, in the BACKLOG\n');
	const v = frozenViolations(dir);
	assert.strictEqual(v.length, 1);
	assert.ok(v[0].file.includes('Backlog'), 'file must be where the mint is');
	assert.ok(v[0].declaredIn.includes('Roadmap'), 'and the freeze is still attributed');
});

test('[series] a `repo:slice` qualified reference can never be a mint', () => {
	// `DT-1`..`DT-39` mean different slices in ewc3-docs-tools and in MedAR DevTools - 39
	// overlapping IDs across two estates, and no hub re-charter resolves it because the estates
	// have separate registries. A qualified reference disambiguates, and costs nothing to support:
	// every declaring pattern is anchored and needs `-` immediately after the prefix token, while a
	// qualifier puts `:` there instead.
	const dir = roadmapRepo(`${OWNS_VS}`
		+ '\n| ID | State | Slice |\n| --- | --- | --- |\n| VS-9 | done | a real mint |\n'
		+ '| ewc3-docs-tools:DT-12 | note | qualified, in an ID cell |\n'
		+ '\n### DevTools:DT-82 the other estate\n'
		+ '\n1. `DevTools:DT-65` - qualified, in a list item\n'
		+ '\n### SXDW:DW-1 an ALL-CAPS repo name, still not a mint\n');
	const ids = declaredIds(path.join(dir, 'docs', 'project', 'X_Development_Roadmap.md'));
	assert.deepStrictEqual([...ids.keys()], ['VS-9'],
		'only the bare ID declares; every qualified reference is a citation');
	assert.deepStrictEqual(undeclaredPrefixes(dir), [],
		'and no qualified reference raises an undeclared-prefix failure');
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
	// Table cells escape pipes and prose does not, so `\|` legitimately becomes `|` on the way
	// into a slice document - and back again when the Delivery Index is rendered from it. That
	// is a change of NOTATION, not of content, so the comparison is made in one notation.
	const plain = (t) => t.split('\\|').join('|');
	const missing = [...new Set(words(plain(source)))].filter((w) => !plain(all).includes(w));
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
	// Deliberate change: a range still claims every slice in it, but each one now gets its own
	// document. Frontmatter is the declaration, and a document carrying two ids has no single
	// `id:` to declare - so the Delivery Index could not be regenerated from it.
	const r = extractSlices(ROADMAP);
	const a = r.docs.find((d) => d.file.startsWith('VS-00371_'));
	const b = r.docs.find((d) => d.file.startsWith('VS-00372_'));
	assert.ok(a && b, 'VS-371 through VS-372 is two slices, so two documents');
	assert.deepStrictEqual(a.ids, ['VS-00371']);
	assert.deepStrictEqual(b.ids, ['VS-00372']);

	// The narrative is NOT copied into both. One points at the other, because the same prose
	// in two files is how two files start disagreeing.
	assert.strictEqual(b.data.see, 'VS-00371');
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
// The Delivery Index as a PROJECTION of the slice documents that declare its rows.
//
// Every one of these was found by running the round trip over the six real registers in the
// estate rather than by reading the code, which is why they are phrased as properties of a
// register rather than of a function.

const HDC_SHAPE = [
	'# Roadmap',
	'',
	'## Delivery Index',
	'',
	'| ID | Title | State | Notes |',
	'| --- | --- | --- | --- |',
	'| HDC-1 | the burster | **done** | See Slice Notes. |',
	'| HDC-13 | the lookup that stopped every export | **deployed** | See Slice Notes. |',
	'',
	'## Slice Notes',
	'',
	'### HDC-13 — VS-413: the lookup that would have stopped every export',
	'',
	'Body.',
	'',
].join('\n');

// ---------------------------------------------------------------------------
// Four findings codex left on the round-trip commit that went UNREAD FOR SIX DAYS while this
// lane reported the branch "settled" and "clean". The position was current; the REVIEW was not.
//
// Three of them live in bin/, which the suite could not reach - so the most dangerous logic in
// the toolkit was also the least testable. These drive the real CLI.

/** Run the CLI against a throwaway repo and return { code, out }. */
function cli(args, repo) {
	const r = require('child_process').spawnSync(process.execPath,
		[path.join(__dirname, '..', 'bin', 'ewc3-docs.js'), ...args, '--repo', repo],
		{ encoding: 'utf8' });
	return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

function stagedRepo() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-'));
	const index = ['# R', '', '## Delivery Index', '', '| ID | State | Slice | Status |',
		'| --- | --- | --- | --- |', '| VS-1 | planned | first | x |', ''].join('\n');
	fs.mkdirSync(path.join(dir, 'docs', 'project'), { recursive: true });
	fs.mkdirSync(path.join(dir, 'docs', 'project_v2', 'slices'), { recursive: true });
	fs.writeFileSync(path.join(dir, 'docs', 'project', 'R_Roadmap.md'), index);
	fs.writeFileSync(path.join(dir, 'docs', 'project_v2', 'R_Roadmap.md'), index);
	fs.writeFileSync(path.join(dir, 'docs', 'project_v2', 'slices', 'VS-1_first.md'),
		'---\nid: VS-1\nstate: coded\ntitle: CHANGED\n---\n\n# VS-1\n');
	// Committed, because `index --write` takes its hand-edit baseline from git (DOCS-056).
	git(dir, 'init', '-q');
	git(dir, 'add', '-A');
	git(dir, 'commit', '-qm', 'staged');
	return dir;
}

test('[index] STAGED slices never write the LIVE roadmap', () => {
	// P1. The slice directory fell back to docs/project_v2/slices while the roadmap target stayed
	// the live docs/project tree - so the DOCUMENTED command, in the NORMAL pre-adoption state of
	// every repo in the estate, would have rewritten an authoritative register from generated
	// previews. Two of six repos were exposed; the other four were saved by a README happening to
	// sit in docs/project/slices, which is not a design.
	//
	// The rule that removes the class: the slices and the roadmap they render into come from the
	// SAME TREE.
	const dir = stagedRepo();
	const live = path.join(dir, 'docs', 'project', 'R_Roadmap.md');
	const before = fs.readFileSync(live, 'utf8');

	const r = cli(['index', '--write'], dir);
	assert.strictEqual(fs.readFileSync(live, 'utf8'), before,
		'the live register must not be touched by a staged preview');
	assert.ok(r.out.includes('project_v2'), 'and the staged copy is what it renders into');
	assert.ok(fs.readFileSync(path.join(dir, 'docs', 'project_v2', 'R_Roadmap.md'), 'utf8')
		.includes('CHANGED'), 'which it did write');
});

test('[index] VS-4 and VS-004 declared by two documents are ONE id, and refused', () => {
	// Codex P1, PR #6. The duplicate check compared ids as written, so VS-001 and VS-1 passed it - and
	// renderIndex, which normalises, kept only one of the two documents and exited 0.
	const dir = stagedRepo();
	fs.writeFileSync(path.join(dir, 'docs', 'project_v2', 'slices', 'VS-001_again.md'),
		'---\nid: VS-001\nstate: planned\ntitle: OTHER\n---\n\n# VS-001\n');
	const r = cli(['index'], dir);
	assert.strictEqual(r.code, 2, r.out);
	assert.ok(r.out.includes('VS-1_first.md') && r.out.includes('VS-001_again.md'), r.out);
});

test('[index] two documents declaring one id is REFUSED', () => {
	// P1. `byId` as a Map silently keeps whichever document was read last, and VS-1_First.md and
	// VS-1_Second.md coexist because the filename carries a title slug too. One commitment renders,
	// the other vanishes without a word. Which of two documents owns an id is not a tool decision.
	const dir = stagedRepo();
	fs.writeFileSync(path.join(dir, 'docs', 'project_v2', 'slices', 'VS-1_second.md'),
		'---\nid: VS-1\nstate: planned\ntitle: OTHER\n---\n\n# VS-1\n');
	const r = cli(['index'], dir);
	assert.strictEqual(r.code, 2);
	assert.ok(/declared by more than one document/.test(r.out));
	assert.ok(r.out.includes('VS-1_first.md') && r.out.includes('VS-1_second.md'),
		'both documents are named, because the human has to pick');
});

test('[index] rendering NO Delivery Index at all is not a success', () => {
	// A misspelled heading, an overly broad glob or a backlog-only repo all produced exit 0 - a
	// confident pass over nothing examined. Same shape as `tables` reporting success across 0 files.
	const dir = stagedRepo();
	const staged = path.join(dir, 'docs', 'project_v2', 'R_Roadmap.md');
	fs.writeFileSync(staged, fs.readFileSync(staged, 'utf8').replace('## Delivery Index', '## Deliverry Index'));
	const r = cli(['index'], dir);
	assert.strictEqual(r.code, 2);
	assert.ok(/no roadmap in that tree carries a recognised Delivery Index/.test(r.out));
});

// ---------------------------------------------------------------------------
// DOCS-056. Once a repository adopts slice documents its Delivery Index is GENERATED. Two gates keep
// it that way: `index --write` refuses a row hand-edited since it was last committed or written (L1),
// and `index --check` fails when a row differs from what its document renders (L2). Each control
// below is a lettered case from the agreed table, and each was run against the ungated command first.

function git(dir, ...args) {
	const r = require('child_process').spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t',
		'-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd: dir, encoding: 'utf8' });
	if (r.status !== 0) { throw new Error(`git ${args.join(' ')}: ${r.stderr}`); }
	return r.stdout.trim();
}

const GATE_DOC = (id, state, title, status) =>
	`---\nid: ${id}\nstate: ${state}\ntitle: ${title}\nstatus: ${status}\n---\n\n# ${id}\n`;

/** An adopted repository, committed and consistent: two rows, two documents that render them. */
function gateRepo() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'));
	fs.mkdirSync(path.join(dir, 'docs', 'project', 'slices'), { recursive: true });
	fs.writeFileSync(path.join(dir, 'docs', 'project', 'R_Roadmap.md'), ['# R', '', '## Delivery Index', '',
		'| ID | State | Slice | Status |', '| --- | --- | --- | --- |',
		'| VS-1 | planned | first | x |', '| VS-2 | coded | second | y |', ''].join('\n'));
	fs.writeFileSync(path.join(dir, 'docs', 'project', 'slices', 'VS-1_first.md'), GATE_DOC('VS-1', 'planned', 'first', 'x'));
	fs.writeFileSync(path.join(dir, 'docs', 'project', 'slices', 'VS-2_second.md'), GATE_DOC('VS-2', 'coded', 'second', 'y'));
	git(dir, 'init', '-q');
	git(dir, 'add', '-A');
	git(dir, 'commit', '-qm', 'adopted');
	return dir;
}
const gateRoadmap = (dir) => path.join(dir, 'docs', 'project', 'R_Roadmap.md');
const gateDoc = (dir, id) => path.join(dir, 'docs', 'project', 'slices',
	fs.readdirSync(path.join(dir, 'docs', 'project', 'slices')).find((n) => n.startsWith(`${id}_`)));
function swap(file, from, to) {
	const text = fs.readFileSync(file, 'utf8');
	assert.ok(text.includes(from), `fixture: ${from} not in ${file}`);
	fs.writeFileSync(file, text.replace(from, to));
}
const handEdit = (dir) => swap(gateRoadmap(dir), '| VS-1 | planned | first | x |', '| VS-1 | planned | typed by hand | x |');
const docEdit = (dir, title = 'renamed') => swap(gateDoc(dir, 'VS-1'), 'title: first', `title: ${title}`);

test('[index-gate] a consistent adopted repository passes --check', () => {
	const r = cli(['index', '--check'], gateRepo());
	assert.strictEqual(r.code, 0, r.out);
});

test('[index-gate] A: document edited, row untouched - --write renders it, --check fails until it does', () => {
	const dir = gateRepo();
	docEdit(dir);
	const check = cli(['index', '--check'], dir);
	assert.strictEqual(check.code, 1, check.out);
	assert.ok(check.out.includes('VS-1'), 'a failure names the id');
	assert.ok(!check.out.includes('VS-2'), 'and only the id that diverged');
	assert.ok(!fs.readFileSync(gateRoadmap(dir), 'utf8').includes('renamed'), '--check never writes');

	const write = cli(['index', '--write'], dir);
	assert.strictEqual(write.code, 0, write.out);
	assert.ok(fs.readFileSync(gateRoadmap(dir), 'utf8').includes('| VS-1 | planned | renamed | x |'));
	assert.strictEqual(cli(['index', '--check'], dir).code, 0);
});

test('[index-gate] B: row hand-edited, document untouched - --write REFUSES, --check fails', () => {
	const dir = gateRepo();
	handEdit(dir);
	const before = fs.readFileSync(gateRoadmap(dir), 'utf8');
	const write = cli(['index', '--write'], dir);
	assert.strictEqual(write.code, 1, write.out);
	assert.ok(/VS-1/.test(write.out) && /hand-edited/.test(write.out), write.out);
	assert.ok(write.out.includes('R_Roadmap.md:7'), 'the refusal names file and line');
	assert.strictEqual(fs.readFileSync(gateRoadmap(dir), 'utf8'), before, 'the edit is not discarded');

	const check = cli(['index', '--check'], dir);
	assert.strictEqual(check.code, 1);
	assert.ok(check.out.includes('VS-1') && check.out.includes('typed by hand'), check.out);
});

test('[index-gate] C: row AND document edited - --write refuses, --check fails', () => {
	const dir = gateRepo();
	handEdit(dir);
	docEdit(dir);
	const before = fs.readFileSync(gateRoadmap(dir), 'utf8');
	assert.strictEqual(cli(['index', '--write'], dir).code, 1);
	assert.strictEqual(fs.readFileSync(gateRoadmap(dir), 'utf8'), before);
	assert.strictEqual(cli(['index', '--check'], dir).code, 1);
});

test('[index-gate] D: a hand edit that was COMMITTED - --write renders over it, --check is what catches it', () => {
	const dir = gateRepo();
	handEdit(dir);
	git(dir, 'commit', '-qam', 'typed into the register');
	const check = cli(['index', '--check'], dir);
	assert.strictEqual(check.code, 1, 'this is the case L2 exists for: L1 cannot see a committed edit');
	assert.ok(check.out.includes('VS-1'));
	assert.strictEqual(cli(['index', '--write'], dir).code, 0);
	assert.ok(fs.readFileSync(gateRoadmap(dir), 'utf8').includes('| VS-1 | planned | first | x |'));
});

test('[index-gate] E: document edited and committed, never rendered - --write renders, --check fails', () => {
	const dir = gateRepo();
	docEdit(dir);
	git(dir, 'commit', '-qam', 'doc only');
	assert.strictEqual(cli(['index', '--check'], dir).code, 1);
	assert.strictEqual(cli(['index', '--write'], dir).code, 0);
	assert.ok(fs.readFileSync(gateRoadmap(dir), 'utf8').includes('renamed'));
});

test('[index-gate] F: render, edit the document again, render again - NOT a hand edit', () => {
	// LabsHQ finding 3. With HEAD as the only baseline the second render refuses: the first one already
	// moved the row away from HEAD, and HEAD cannot tell a render from a typist.
	const dir = gateRepo();
	docEdit(dir, 'renamed');
	assert.strictEqual(cli(['index', '--write'], dir).code, 0);
	swap(gateDoc(dir, 'VS-1'), 'title: renamed', 'title: again');
	const second = cli(['index', '--write'], dir);
	assert.strictEqual(second.code, 0, second.out);
	assert.ok(fs.readFileSync(gateRoadmap(dir), 'utf8').includes('| VS-1 | planned | again | x |'));
	// A typist editing the row the tool just wrote is still a typist.
	swap(gateRoadmap(dir), '| VS-1 | planned | again | x |', '| VS-1 | planned | typed | x |');
	assert.strictEqual(cli(['index', '--write'], dir).code, 1);
});

test('[index-gate] P: a row that differs ONLY in padding is not an edit, and not a divergence', () => {
	// Cells, not bytes. `format` and `index` disagree about column padding (DOCS-059); a gate comparing
	// bytes would fail every repository that ran both.
	const dir = gateRepo();
	swap(gateRoadmap(dir), '| VS-1 | planned | first | x |', '|  VS-1 |\tplanned   | first |x|');
	assert.strictEqual(cli(['index', '--check'], dir).code, 0, 'uncommitted padding');
	git(dir, 'commit', '-qam', 'padding');
	assert.strictEqual(cli(['index', '--check'], dir).code, 0, 'committed padding');
	swap(gateDoc(dir, 'VS-2'), 'title: second', 'title: moved');
	const write = cli(['index', '--write'], dir);
	assert.strictEqual(write.code, 0, write.out);
});

test('[index-gate] P: an edge character GFM does NOT trim is still a difference', () => {
	// LabsHQ finding 7. `.trim()` strips a no-break space, and GitHub renders one - every extra
	// normalisation is a place a real change can hide.
	const dir = gateRepo();
	swap(gateRoadmap(dir), '| first |', '| first |');
	git(dir, 'commit', '-qam', 'nbsp');
	const check = cli(['index', '--check'], dir);
	assert.strictEqual(check.code, 1, check.out);
});

test('[index-gate] --write keeps a format-clean register format-clean - no churn of every row', () => {
	// Found dogfooding fold: one state change made `index --write` re-render EVERY row with inline links in a
	// register `format` had moved to reference style - a 98-line diff, and `check` red until `fix`.
	const dir = gateRepo();
	const target = 'slices/VS-1_a_path_long_enough_that_format_moves_it.md';
	swap(gateDoc(dir, 'VS-1'), 'status: x', `status: see [VS-1](${target})`);
	assert.strictEqual(cli(['index', '--write'], dir).code, 0);
	assert.strictEqual(cli(['format', 'docs/project/R_Roadmap.md'], dir).code, 0);
	git(dir, 'commit', '-qam', 'formatted register');
	const formatted = fs.readFileSync(gateRoadmap(dir), 'utf8');

	swap(gateDoc(dir, 'VS-2'), 'state: coded', 'state: planned');
	const r = cli(['index', '--write'], dir);
	assert.strictEqual(r.code, 0, r.out);
	assert.strictEqual(cli(['format', '--check', 'docs/project/R_Roadmap.md'], dir).code, 0, 'still format-clean');
	const changed = git(dir, 'diff', '--numstat', '--', 'docs/project/R_Roadmap.md').split('\t').slice(0, 2).map(Number);
	assert.deepStrictEqual(changed, [1, 1], `only the VS-2 row changes:\n${git(dir, 'diff')}`);
	assert.ok(fs.readFileSync(gateRoadmap(dir), 'utf8') !== formatted);
	assert.strictEqual(cli(['index', '--check'], dir).code, 0);
});

test('[index-gate] L: a row as `format` rewrote it is consistent - with no link syntax parsed at all', () => {
	// Found dogfooding: `index` renders `[DOCS-001](slices/...)` and `format` rewrites it to
	// `[DOCS-001][docs-001]` plus a definition, so all 43 rows here read as diverged. Six review rounds
	// on PR #6 then found six ways a hand-rolled reference resolver let a REAL change compare equal. So
	// nothing is resolved: a row is consistent when its cells are exactly what `index` writes, or exactly
	// what `format` makes of that.
	const dir = gateRepo();
	const target = 'slices/VS-1_a_path_long_enough_that_format_moves_it.md';
	swap(gateDoc(dir, 'VS-1'), 'status: x', `status: see [VS-1](${target})`);
	assert.strictEqual(cli(['index', '--write'], dir).code, 0);
	assert.strictEqual(cli(['format', 'docs/project/R_Roadmap.md'], dir).code, 0);
	const formatted = fs.readFileSync(gateRoadmap(dir), 'utf8');
	assert.ok(!formatted.includes(`](${target})`), 'fixture: format moved the link into a definition');
	assert.strictEqual(cli(['index', '--check'], dir).code, 0, 'the formatted row is consistent');

	// Render, format, render: the formatted row is what the tool last wrote, once formatted.
	swap(gateDoc(dir, 'VS-1'), 'title: first', 'title: again');
	const again = cli(['index', '--write'], dir);
	assert.strictEqual(again.code, 0, again.out);

	// A definition re-pointed by hand is a different link. `format` gives the rendered target its own
	// label, so the row's label no longer matches - caught without reading the definition at all.
	assert.strictEqual(cli(['format', 'docs/project/R_Roadmap.md'], dir).code, 0);
	const label = /\[VS-1\]\[([^\]]+)\]/.exec(fs.readFileSync(gateRoadmap(dir), 'utf8'))[1];
	swap(gateRoadmap(dir), `[${label}]: ${target}`, `[${label}]: slices/VS-1_somewhere_else_entirely_by_hand.md`);
	assert.strictEqual(cli(['index', '--check'], dir).code, 1, 'a re-pointed definition');
});

test('[index-gate] a formatted row whose DEFINITION is gone is not consistent', () => {
	// Codex, PR #6. Only the formatted ROW was compared, so `[VS-1][label]` with its definition deleted
	// still matched - and GitHub renders literal brackets. The formatted form now counts only when the
	// roadmap outside its rows is exactly what `format` writes, which is where the definitions live.
	const dir = gateRepo();
	const target = 'slices/VS-1_a_path_long_enough_that_format_moves_it.md';
	swap(gateDoc(dir, 'VS-1'), 'status: x', `status: see [VS-1](${target})`);
	assert.strictEqual(cli(['index', '--write'], dir).code, 0);
	assert.strictEqual(cli(['format', 'docs/project/R_Roadmap.md'], dir).code, 0);
	assert.strictEqual(cli(['index', '--check'], dir).code, 0, 'fixture: consistent while the definition exists');
	const text = fs.readFileSync(gateRoadmap(dir), 'utf8');
	const def = text.split('\n').find((l) => l.endsWith(`: ${target}`));
	assert.ok(def, 'fixture: format wrote a definition');
	fs.writeFileSync(gateRoadmap(dir), text.replace(`${def}\n`, ''));
	const r = cli(['index', '--check'], dir);
	assert.strictEqual(r.code, 1, r.out);
	assert.ok(r.out.includes('VS-1'), r.out);
});

test('[index-gate] J: one id in TWO roadmaps is a duplicate too', () => {
	// Codex, PR #6: rows were grouped per file, so VS-1 once in each of two registers passed --check and
	// --write rendered the one document into both.
	const dir = gateRepo();
	fs.copyFileSync(gateRoadmap(dir), path.join(dir, 'docs', 'project', 'S_Roadmap.md'));
	git(dir, 'add', '-A');
	git(dir, 'commit', '-qm', 'second register');
	const check = cli(['index', '--check'], dir);
	assert.strictEqual(check.code, 1, check.out);
	assert.ok(check.out.includes('R_Roadmap.md:7') && check.out.includes('S_Roadmap.md:7'), check.out);
	const before = fs.readFileSync(gateRoadmap(dir), 'utf8');
	swap(gateDoc(dir, 'VS-1'), 'title: first', 'title: renamed');
	assert.strictEqual(cli(['index', '--write'], dir).code, 1);
	assert.strictEqual(fs.readFileSync(gateRoadmap(dir), 'utf8'), before, 'nothing written');
});

test('[index-gate] a reference link `format` would NOT write is compared literally - loud, never silent', () => {
	// The cost of parsing no link syntax, pinned so it is a decision and not a surprise: a short target
	// `format` leaves inline, hand-written as a reference, reads as diverged even though GitHub renders
	// the same link. Every one of the six resolver bugs was the opposite failure - silent.
	const dir = gateRepo();
	swap(gateDoc(dir, 'VS-1'), 'status: x', 'status: see [VS-1](slices/u.md)');
	assert.strictEqual(cli(['index', '--write'], dir).code, 0);
	swap(gateRoadmap(dir), '[VS-1](slices/u.md)', '[VS-1][u]');
	fs.appendFileSync(gateRoadmap(dir), '\n[u]: slices/u.md\n');
	assert.strictEqual(cli(['index', '--check'], dir).code, 1);
});

test('[index-gate] R: row and document BOTH absent is consistent', () => {
	const dir = gateRepo();
	swap(gateRoadmap(dir), '| VS-2 | coded | second | y |\n', '');
	fs.unlinkSync(gateDoc(dir, 'VS-2'));
	git(dir, 'commit', '-qam', 'archived VS-2');
	assert.strictEqual(cli(['index', '--check'], dir).code, 0);
});

test('[index-gate] S/M: a row whose document is gone FAILS --check - adoption is the documents, not a marker', () => {
	// Nothing in this fixture says "adopted" except that slice documents declare ids. Deleting a marker
	// line must never be the way to turn CI green (LabsHQ finding 6).
	const dir = gateRepo();
	fs.unlinkSync(gateDoc(dir, 'VS-2'));
	const check = cli(['index', '--check'], dir);
	assert.strictEqual(check.code, 1, check.out);
	assert.ok(check.out.includes('VS-2'));
});

test('[index-gate] a document claiming an id with no row fails --check', () => {
	const dir = gateRepo();
	fs.writeFileSync(path.join(dir, 'docs', 'project', 'slices', 'VS-9_ghost.md'), GATE_DOC('VS-9', 'planned', 'ghost', 'z'));
	const check = cli(['index', '--check'], dir);
	assert.strictEqual(check.code, 1);
	assert.ok(check.out.includes('VS-9'));
});

test('[index-gate] T: no document declares an id - did not run', () => {
	const dir = gateRepo();
	for (const id of ['VS-1', 'VS-2']) { swap(gateDoc(dir, id), `id: ${id}\n`, ''); }
	assert.strictEqual(cli(['index', '--check'], dir).code, 2);
});

test('[index-gate] G: a linked worktree, where .git is a FILE, gates exactly like the main checkout', () => {
	const dir = gateRepo();
	const wt = `${dir}-wt`;
	git(dir, 'worktree', 'add', '-q', wt);
	assert.ok(fs.statSync(path.join(wt, '.git')).isFile(), 'fixture: a real linked worktree');
	assert.strictEqual(cli(['index', '--check'], wt).code, 0);
	// F inside the worktree: the last-written record must live per worktree and be found there.
	docEdit(wt);
	assert.strictEqual(cli(['index', '--write'], wt).code, 0);
	swap(gateDoc(wt, 'VS-1'), 'title: renamed', 'title: again');
	assert.strictEqual(cli(['index', '--write'], wt).code, 0);
	swap(gateRoadmap(wt), '| VS-1 | planned | again | x |', '| VS-1 | planned | typed | x |');
	assert.strictEqual(cli(['index', '--write'], wt).code, 1);
	// And the main checkout's record is not the worktree's.
	docEdit(dir);
	assert.strictEqual(cli(['index', '--write'], dir).code, 0);
});

test('[index-gate] H: unresolved merge conflicts - neither command runs', () => {
	// The tree may hold conflict markers, and ids named from one are a diagnosis of the wrong thing.
	const dir = gateRepo();
	git(dir, 'checkout', '-q', '-b', 'other');
	swap(gateRoadmap(dir), '| first |', '| theirs |');
	git(dir, 'commit', '-qam', 'theirs');
	git(dir, 'checkout', '-q', '-');
	swap(gateRoadmap(dir), '| first |', '| ours |');
	git(dir, 'commit', '-qam', 'ours');
	assert.throws(() => git(dir, 'merge', 'other'), 'fixture: a real conflict');
	for (const mode of ['--write', '--check']) {
		const r = cli(['index', mode], dir);
		assert.strictEqual(r.code, 2, `${mode}: ${r.out}`);
		assert.ok(/unresolved conflicts/.test(r.out), r.out);
		assert.ok(!r.out.includes('VS-1'), 'no id diagnosis');
	}
});

test('[index-gate] H: an operation in progress with NO conflicts - --write refuses, --check still runs', () => {
	// Codex, PR #6. --check compares the tree with itself; what makes a tree unreadable is conflict
	// markers, not the operation. --write is different: mid-operation, HEAD is the wrong baseline.
	for (const [name, what] of [['MERGE_HEAD', 'merge'], ['CHERRY_PICK_HEAD', 'cherry-pick'], ['REVERT_HEAD', 'revert'], ['rebase-merge', 'rebase']]) {
		const dir = gateRepo();
		const at = git(dir, 'rev-parse', '--path-format=absolute', '--git-path', name);
		if (name === 'rebase-merge') { fs.mkdirSync(at); } else { fs.writeFileSync(at, git(dir, 'rev-parse', 'HEAD')); }
		const w = cli(['index', '--write'], dir);
		assert.strictEqual(w.code, 2, `${what} --write: ${w.out}`);
		assert.ok(w.out.includes(`${what} in progress`), w.out);
		const c = cli(['index', '--check'], dir);
		assert.strictEqual(c.code, 0, `${what} --check: ${c.out}`);
	}
});

test('[index-gate] I: a rebase in progress refuses WITHOUT diagnosing ids', () => {
	// Mid-rebase HEAD is the commit being replayed onto, so every row of the commit being applied looks
	// hand-edited. Naming them would be a confident diagnosis of the wrong thing.
	const dir = gateRepo();
	handEdit(dir);
	fs.mkdirSync(git(dir, 'rev-parse', '--path-format=absolute', '--git-path', 'rebase-merge'));
	const r = cli(['index', '--write'], dir);
	assert.strictEqual(r.code, 2, r.out);
	assert.ok(/rebase in progress/.test(r.out));
	assert.ok(!r.out.includes('VS-1'), 'no id diagnosis');
});

test('[index-gate] J: one id with two rows fails, naming BOTH lines', () => {
	const dir = gateRepo();
	swap(gateRoadmap(dir), '| VS-2 | coded | second | y |\n', '| VS-2 | coded | second | y |\n| VS-1 | planned | first | x |\n');
	const r = cli(['index', '--check'], dir);
	assert.strictEqual(r.code, 1, r.out);
	assert.ok(r.out.includes('R_Roadmap.md:7') && r.out.includes('R_Roadmap.md:9'), r.out);
});

test('[index-gate] J: one id with two rows REFUSES --write - both rows would be rendered from one document', () => {
	// Codex, PR #6. Both committed rows matched their baseline, so the gate let them through and both were
	// overwritten with the same document's values - exit 1, after the content was already gone.
	const dir = gateRepo();
	swap(gateRoadmap(dir), '| VS-2 | coded | second | y |\n', '| VS-2 | coded | second | y |\n| VS-001 | planned | a different row | z |\n');
	git(dir, 'commit', '-qam', 'duplicate, committed');
	swap(gateDoc(dir, 'VS-1'), 'title: first', 'title: renamed');
	const before = fs.readFileSync(gateRoadmap(dir), 'utf8');
	const r = cli(['index', '--write'], dir);
	assert.strictEqual(r.code, 1, r.out);
	assert.ok(r.out.includes('R_Roadmap.md:7') && r.out.includes('R_Roadmap.md:9'), r.out);
	assert.strictEqual(fs.readFileSync(gateRoadmap(dir), 'utf8'), before, 'nothing written');
});

test('[index-gate] K1: malformed slice frontmatter exits 1 NAMING THE FILE, and writes nothing', () => {
	// Expected bad input is a finding, not a crash - a raw stack trace exiting 1 names nothing.
	const dir = gateRepo();
	docEdit(dir);
	fs.writeFileSync(path.join(dir, 'docs', 'project', 'slices', 'VS-3_bad.md'), '---\nid: VS-3\n  nested: x\n---\n');
	const before = fs.readFileSync(gateRoadmap(dir), 'utf8');
	for (const mode of ['--check', '--write']) {
		const r = cli(['index', mode], dir);
		assert.strictEqual(r.code, 1, `${mode}: ${r.out}`);
		assert.ok(r.out.includes('VS-3_bad.md'), r.out);
		assert.ok(!/\n\s+at /.test(r.out), 'no stack trace');
	}
	assert.strictEqual(fs.readFileSync(gateRoadmap(dir), 'utf8'), before);
});

test('[index-gate] K2: a genuinely unexpected throw exits 2, never 1', () => {
	const dir = gateRepo();
	const r = cli(['index', '--check', '--slices', 'docs/project/R_Roadmap.md'], dir);
	assert.strictEqual(r.code, 2, r.out);
	assert.ok(/did not run/.test(r.out), r.out);
});

test('[index-gate] --write outside a git work tree does not run; --check does not need git', () => {
	const dir = gateRepo();
	fs.rmSync(path.join(dir, '.git'), { recursive: true, force: true });
	const w = cli(['index', '--write'], dir);
	assert.strictEqual(w.code, 2, w.out);
	assert.ok(/not a git work tree/.test(w.out));
	assert.strictEqual(cli(['index', '--check'], dir).code, 0, 'the comparison needs no history');
});

test('[index-gate] --write on a roadmap that was never committed does not run', () => {
	const dir = gateRepo();
	git(dir, 'rm', '-q', '--cached', 'docs/project/R_Roadmap.md');
	git(dir, 'commit', '-qm', 'untrack');
	const r = cli(['index', '--write'], dir);
	assert.strictEqual(r.code, 2, r.out);
	assert.ok(/not committed/.test(r.out), r.out);
});

test('[index-gate] a NEW row has no baseline, so it is minted, not refused', () => {
	// A human mints the row (a placeholder); the document fills it. Refusing a row with no history
	// would make minting impossible.
	const dir = gateRepo();
	swap(gateRoadmap(dir), '| VS-2 | coded | second | y |\n', '| VS-2 | coded | second | y |\n| VS-3 | | | |\n');
	fs.writeFileSync(path.join(dir, 'docs', 'project', 'slices', 'VS-3_third.md'), GATE_DOC('VS-3', 'planned', 'third', 'z'));
	const r = cli(['index', '--write'], dir);
	assert.strictEqual(r.code, 0, r.out);
	assert.ok(fs.readFileSync(gateRoadmap(dir), 'utf8').includes('| VS-3 | planned | third | z |'));
});

test('[index-gate] renaming a row\'s id does not launder a hand edit through the new-row exemption', () => {
	// Codex P1, PR #6. A row with no history is exempt so a placeholder can be minted - but VS-1 renamed to
	// VS-9 has no history either, and whatever was typed into it was overwritten with exit 0. The
	// exemption is for a row whose writing loses nothing typed: every non-empty cell already renders.
	const dir = gateRepo();
	swap(gateRoadmap(dir), '| VS-1 | planned | first | x |', '| VS-9 | planned | typed by hand | x |');
	swap(gateDoc(dir, 'VS-1'), 'id: VS-1', 'id: VS-9');
	const before = fs.readFileSync(gateRoadmap(dir), 'utf8');
	const r = cli(['index', '--write'], dir);
	assert.strictEqual(r.code, 1, r.out);
	assert.ok(r.out.includes('VS-9') && r.out.includes('typed by hand'), r.out);
	assert.strictEqual(fs.readFileSync(gateRoadmap(dir), 'utf8'), before);

	// A minted row that already says what its document says loses nothing, so it is still allowed.
	const mint = gateRepo();
	swap(gateRoadmap(mint), '| VS-2 | coded | second | y |\n', '| VS-2 | coded | second | y |\n| VS-3 | planned | third | |\n');
	fs.writeFileSync(path.join(mint, 'docs', 'project', 'slices', 'VS-3_third.md'), GATE_DOC('VS-3', 'planned', 'third', 'z'));
	const m = cli(['index', '--write'], mint);
	assert.strictEqual(m.code, 0, m.out);
});

test('[index-gate] --write and --check together is a usage error', () => {
	assert.strictEqual(cli(['index', '--write', '--check'], gateRepo()).code, 2);
});

// ---------------------------------------------------------------------------
// DOCS-062. A repository that already has slice documents from before the frontmatter shape. Migration
// recognised an existing document only by an exact frontmatter `id:`, so an older document - no
// frontmatter, no `id:`, unreadable frontmatter, or an id padded differently - was regenerated without
// a word, and adopting the staged tree overwrote or orphaned the prose. Nothing a human wrote may be lost:
// every existing document is inventoried, and every one reaches the staged tree byte-for-byte.

// ---------------------------------------------------------------------------
// DOCS-065. `migrate-project` and `index` must agree about the register migrate writes. A downstream
// cutover rehearsal found every row diverged at the same SHA: migrate wrote a pointer into the Status
// cell, index rendered the (empty, or paragraph-long) frontmatter `status:`. And the moved prose broke
// links: evidence lines read as reference links, and relative targets were not repointed one folder down.

/** A register, WITH or WITHOUT a Doc column, whose rows and narrative carry every link shape at risk. */
function agreeRepo({ docColumn }) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agree-'));
	const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
	const head = docColumn ? '| ID | State | Slice | Doc | Status |' : '| ID | State | Slice | Status |';
	const sep = docColumn ? '| --- | --- | --- | --- | --- |' : '| --- | --- | --- | --- |';
	const row = (id, state, title, status) => (docColumn ? `| ${id} | ${state} | ${title} | - | ${status} |` : `| ${id} | ${state} | ${title} | ${status} |`);
	w('README.md', 'See [the roadmap](docs/project/R_Roadmap.md).\n');
	w('docs/project/R_Roadmap.md', [
		'# R', '',
		'## Delivery Index', '',
		head, sep,
		row('VS-1', 'coded', 'first', 'Built. See [the design](../design/first.md) and [notes](notes.md). Smoked twice.'),
		row('VS-2', 'planned', 'second', 'Two sentences here. And [a ref][design-ref].'),
		row('VS-3', 'planned', 'third', 'A follower\'s own paragraph. It is long enough to matter.'),
		row('VS-4', 'planned', 'fourth', 'short, per [`design/first.md`](../design/first.md)'),
		'',
		'## Slice Notes', '',
		'### VS-2 through VS-3 — second and third', '',
		'Narrative with [a relative link](../design/second.md), a sibling [handoff](Handoff_01.md),',
		'an ![image](diagram.png), a [site](https://example.com/x), and [`the ref`](../design/ref.md).', '',
		'```', 'not a link to rebase: [x](../design/second.md)', '```', '',
		'[design-ref]: ../design/ref.md', '',
	].join('\n'));
	for (const f of ['docs/design/first.md', 'docs/design/second.md', 'docs/design/ref.md', 'docs/project/notes.md',
		'docs/project/Handoff_01.md']) {
		w(f, '# doc\n\nSee [the roadmap](../project/R_Roadmap.md).\n'.replace('../project/R_Roadmap.md', path.relative(path.dirname(f), 'docs/project/R_Roadmap.md').split(path.sep).join('/')));
	}
	w('docs/project/diagram.png', 'png');
	w('config/STATUS.yaml', [
		'done:', "  - '[VS-1][FIX-9] Mint the first thing'", "  - 'VS-2 shipped, see [the log](log.md) and (parens)'", '',
	].join('\n'));
	return dir;
}

/** The cutover's adoption step: the staged register and slices replace the live ones. */
function adopt(dir) {
	const live = path.join(dir, 'docs', 'project');
	const staged = path.join(dir, 'docs', 'project_v2');
	fs.rmSync(path.join(live, 'slices'), { recursive: true, force: true });
	fs.cpSync(path.join(staged, 'slices'), path.join(live, 'slices'), { recursive: true });
	fs.copyFileSync(path.join(staged, 'R_Roadmap.md'), path.join(live, 'R_Roadmap.md'));
	fs.rmSync(staged, { recursive: true, force: true });
}

for (const docColumn of [false, true]) {
	const shape = docColumn ? 'WITH a Doc column' : 'with NO Doc column';

	test(`[migrate-index] index --check passes on migrate's own output, ${shape}`, () => {
		const dir = agreeRepo({ docColumn });
		cli(['migrate-project', '--write'], dir);
		adopt(dir);
		const r = cli(['index', '--check'], dir);
		assert.strictEqual(r.code, 0, r.out);
	});

	test(`[migrate-index] migrating adds no link problems, ${shape}`, () => {
		const dir = agreeRepo({ docColumn });
		const before = checkLinks(dir, { orphanRoot: 'nope' }).problems;
		cli(['migrate-project', '--write'], dir);
		adopt(dir);
		const after = checkLinks(dir, { orphanRoot: 'nope' }).problems;
		assert.deepStrictEqual(after.map((p) => `${p.file} -> ${p.target} (${p.why})`), before.map((p) => `${p.file} -> ${p.target} (${p.why})`));
	});
}

test('[migrate-index] EVERY row\'s Status moves to its document body, followers included; frontmatter status is empty', () => {
	const dir = agreeRepo({ docColumn: false });
	cli(['migrate-project', '--write'], dir);
	const slices = path.join(dir, 'docs', 'project_v2', 'slices');
	for (const [id, text] of [['VS-1', 'Smoked twice.'], ['VS-3', 'It is long enough to matter.'], ['VS-4', 'short']]) {
		const name = fs.readdirSync(slices).find((n) => n.startsWith(`${id}_`));
		const { data, body } = frontmatter.read(fs.readFileSync(path.join(slices, name), 'utf8'));
		assert.strictEqual(data.status, '', `${id} frontmatter status`);
		assert.ok(body.includes(text), `${id} body carries its Status:\n${body}`);
	}
});

// ---------------------------------------------------------------------------
// A downstream pilot migrated a register kept OFF-CANON in docs/project/roadmap/, which already had a register in
// the canonical `| Prefix |` shape. Two defects: every moved link was rebased as though the source sat in
// docs/project/ (one level too deep), and the existing register went unrecognised, so a second one was synthesised.

/** A register in docs/project/roadmap/ with a canonical ownership table, links of every depth, and a sibling repo. */
function offCanonRepo({ register = true } = {}) {
	const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'offcanon-'));
	const dir = path.join(outer, 'this-repo');
	const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
	w('README.md', 'See [the roadmap](docs/project/roadmap/R_Roadmap.md) and [the analysis](docs/analysis/x.md).\n');
	w('docs/analysis/x.md', '# x\n\nBack to [the roadmap](../project/roadmap/R_Roadmap.md).\n');
	const sibling = '../../../../Sibling/docs/y.md';
	const twin = 'https://github.com/example-org/Sibling/blob/main/docs/y.md';
	w('docs/project/roadmap/R_Roadmap.md', [
		'# R', '',
		'Planning prose linking [the analysis](../../analysis/x.md).', '',
		...(register ? ['## ID Ownership Register', '',
			'| Prefix | Scope | Owner | Last Used | Series |', '| --- | --- | --- | --- | --- |',
			'| XY | global | this-repo | XY-003 | our slices |',
			'| TS | reference-only, frozen at TS-02 | other | TS-02 | cited |',
			'| VS | reference-only | other | - | cited |', ''] : []),
		'## Delivery Index', '',
		'| ID | State | Slice | Status |', '| --- | --- | --- | --- |',
		`| XY-001 | coded | first | Built per [the analysis](../../analysis/x.md), sibling [y](${sibling}) and its [twin](${twin}). |`,
		'| XY-003 | planned | third | short |', '',
		'## Slice Notes', '',
		'### XY-001 — first', '',
		`Narrative citing [the analysis](../../analysis/x.md) and [y](${sibling}) ([twin](${twin})).`, '',
	].join('\n'));
	return dir;
}

/** Adoption for an off-canon source: the staged register replaces the one in docs/project/roadmap/, one level up. */
function adoptOffCanon(dir) {
	const live = path.join(dir, 'docs', 'project');
	const staged = path.join(dir, 'docs', 'project_v2');
	fs.cpSync(path.join(staged, 'slices'), path.join(live, 'slices'), { recursive: true });
	fs.copyFileSync(path.join(staged, 'R_Roadmap.md'), path.join(live, 'R_Roadmap.md'));
	fs.rmSync(path.join(live, 'roadmap'), { recursive: true, force: true });
	fs.rmSync(staged, { recursive: true, force: true });
	fs.writeFileSync(path.join(dir, 'README.md'), 'See [the roadmap](docs/project/R_Roadmap.md) and [the analysis](docs/analysis/x.md).\n');
	fs.writeFileSync(path.join(dir, 'docs', 'analysis', 'x.md'), '# x\n\nBack to [the roadmap](../project/R_Roadmap.md).\n');
}

test('[migrate-offcanon] links moved from a roadmap in docs/project/roadmap/ resolve after adoption - no new problems', () => {
	const dir = offCanonRepo();
	const show = (p) => `${p.file} -> ${p.target} (${p.why})`;
	const before = checkLinks(dir, { orphanRoot: 'nope' }).problems.map(show);
	assert.deepStrictEqual(before, [], 'fixture: clean before migrating');
	cli(['migrate-project', '--write'], dir);
	adoptOffCanon(dir);
	assert.deepStrictEqual(checkLinks(dir, { orphanRoot: 'nope' }).problems.map(show), before);
	const doc = fs.readFileSync(path.join(dir, 'docs', 'project', 'slices', fs.readdirSync(path.join(dir, 'docs', 'project', 'slices')).find((n) => n.startsWith('XY-001'))), 'utf8');
	assert.ok(doc.includes('](../../analysis/x.md)') && doc.includes('](../../../../Sibling/docs/y.md)'), doc);
	const roadmap = fs.readFileSync(path.join(dir, 'docs', 'project', 'R_Roadmap.md'), 'utf8');
	assert.ok(roadmap.includes('[the analysis](../analysis/x.md)'), 'the roadmap\'s OWN links move up a level too');
});

test('[migrate-offcanon] a link carried into FRONTMATTER renders correctly from the roadmap\'s new home', () => {
	// A downstream pilot: a `Cross-repo anchor` cell was copied into frontmatter at the SOURCE depth, and index
	// rendered it into the roadmap at docs/project/ one level too deep - 22 of 27 rows diverged. The source is
	// rebased to docs/project/ before anything is carried, so a carried cell is already right where it renders.
	const dir = offCanonRepo();
	const file = path.join(dir, 'docs', 'project', 'roadmap', 'R_Roadmap.md');
	const sibling = '../../../../Sibling/docs/y.md';
	const twin = 'https://github.com/example-org/Sibling/blob/main/docs/y.md';
	fs.writeFileSync(file, fs.readFileSync(file, 'utf8')
		.replace('| ID | State | Slice | Status |\n| --- | --- | --- | --- |', '| ID | State | Slice | Anchor | Status |\n| --- | --- | --- | --- | --- |')
		.replace('| XY-001 | coded | first |', `| XY-001 | coded | first | [anchor](${sibling}) [t](${twin}) · [a](../../analysis/x.md) |`)
		.replace('| XY-003 | planned | third |', '| XY-003 | planned | third | - |'));
	const show = (p) => `${p.file} -> ${p.target} (${p.why})`;
	const before = checkLinks(dir, { orphanRoot: 'nope' }).problems.map(show);
	assert.deepStrictEqual(before, [], 'fixture: clean');
	cli(['migrate-project', '--write'], dir);
	adoptOffCanon(dir);
	const check = cli(['index', '--check'], dir);
	assert.strictEqual(check.code, 0, check.out);
	const roadmap = fs.readFileSync(path.join(dir, 'docs', 'project', 'R_Roadmap.md'), 'utf8');
	assert.ok(roadmap.includes('[anchor](../../../Sibling/docs/y.md)') && roadmap.includes('[a](../analysis/x.md)'), roadmap);
	assert.deepStrictEqual(checkLinks(dir, { orphanRoot: 'nope' }).problems.map(show), before, 'and it resolves');
});

test('[migrate-offcanon] rebaseRelative computes each link from where it WAS to where it WILL BE', () => {
	const { rebaseRelative } = require('../lib/slices');
	const text = '[a](../../analysis/x.md) [b](../../../../Sib/y.md#h) [c](<../my file.md>) [d](https://e.com/x) [e](#local)';
	assert.strictEqual(rebaseRelative(text, { from: 'docs/project/roadmap', to: 'docs/project' }),
		'[a](../analysis/x.md) [b](../../../Sib/y.md#h) [c](<my file.md>) [d](https://e.com/x) [e](#local)');
	assert.strictEqual(rebaseRelative('[s](Sib.md) [u](../d/x.md)'), '[s](../Sib.md) [u](../../d/x.md)', 'the default is docs/project to its slices');
});

test('[migrate-offcanon] a register already in the canonical Prefix shape is kept as-is - no second register', () => {
	const dir = offCanonRepo();
	const source = fs.readFileSync(path.join(dir, 'docs', 'project', 'roadmap', 'R_Roadmap.md'), 'utf8');
	const block = source.slice(source.indexOf('| Prefix |'), source.indexOf('## Delivery Index'));
	const r = cli(['migrate-project', '--write'], dir);
	assert.ok(!/UNCLAIMED/.test(r.out), r.out);
	const staged = fs.readFileSync(path.join(dir, 'docs', 'project_v2', 'R_Roadmap.md'), 'utf8');
	assert.strictEqual(staged.split('\n').filter((l) => /^\|\s*Prefix\s*\|/.test(l)).length, 1, 'exactly one register');
	assert.ok(!staged.includes('## Number Series'), 'nothing synthesised');
	assert.ok(staged.includes(block), 'the register, reference-only and frozen rows included, byte-for-byte');
});

test('[migrate-offcanon] only a table with the full ownership header is the canonical register', () => {
	// Copilot and Codex, PR #16: ANY `| Prefix |` table short-circuited migration, so an unrelated one hid a real
	// legacy register further down, which then never migrated.
	const { migrateText } = require('../lib/migrate');
	const text = ['# R', '', '| Prefix | Meaning |', '| --- | --- |', '| XY | our slices |', '',
		'## Register', '', '| Series | Last Num | Series Description |', '| --- | --- | --- |', '| Slices | XY-003 | the slices |', '',
		'## Delivery Index', '', '| ID | State | Slice |', '| --- | --- | --- |', '| XY-003 | planned | third |', ''].join('\n');
	const r = migrateText(text, { owner: 'this-repo', width: 3 });
	assert.ok(!r.canonical, 'the Prefix/Meaning table is not the register');
	assert.ok(r.text.includes('| Prefix | Scope | Owner | Last Used | Series |'), 'the legacy register was migrated');
});

test('[migrate-offcanon] a canonical register\'s generated "unclaimed" owner is still unresolved', () => {
	// Codex P1, PR #16: the owner cell `**?** _unclaimed_` was read as an owner, so re-running migration on a
	// previously bootstrapped register passed a global series nobody had adjudicated.
	const { migrateText } = require('../lib/migrate');
	const text = ['## ID Register', '', '| Prefix | Scope | Owner | Last Used | Series |', '| --- | --- | --- | --- | --- |',
		'| XY | global | **?** _unclaimed_ | XY-003 | — |', '', '## Delivery Index', '', '| ID | State | Slice |', '| --- | --- | --- |', '| XY-003 | planned | third |', ''].join('\n');
	const row = migrateText(text, { owner: 'this-repo' }).rows.find((x) => x.prefix === 'XY');
	assert.strictEqual(row.owner, null);
});

test('[migrate-offcanon] a canonical register is STALE when any declaring position is past Last Used', () => {
	// Codex P1, PR #16: only first-cell table ids counted, so `### XY-010 — ...` past Last Used XY-003 read clean
	// and the next mint could reuse a live number. The same declaration rules as `series`.
	const { migrateText } = require('../lib/migrate');
	const text = ['## ID Register', '', '| Prefix | Scope | Owner | Last Used | Series |', '| --- | --- | --- | --- | --- |',
		'| XY | global | this-repo | XY-003 | slices |', '', '## Delivery Index', '', '| ID | State | Slice |', '| --- | --- | --- |',
		'| XY-003 | planned | third |', '', '## Slice Notes', '', '### XY-010 — a heading that declares', '', 'Body.', ''].join('\n');
	const row = migrateText(text, { owner: 'this-repo' }).rows.find((x) => x.prefix === 'XY');
	assert.strictEqual(row.highestUsed, 10);
	assert.strictEqual(row.stale, true);
});

test('[migrate-offcanon] a canonical register with NO Last Used is stale once ids are in use', () => {
	// Codex P2, PR #16: `_none yet_` read as unknown rather than zero, so XY-010 in use still reported clean.
	const { migrateText } = require('../lib/migrate');
	const text = ['## ID Register', '', '| Prefix | Scope | Owner | Last Used | Series |', '| --- | --- | --- | --- | --- |',
		'| XY | global | this-repo | _none yet_ | slices |', '| RF | reference-only | elsewhere | _none yet_ | cited |', '',
		'## Delivery Index', '', '| ID | State | Slice |', '| --- | --- | --- |', '| XY-010 | planned | tenth |', '| RF-004 | planned | cited |', ''].join('\n');
	const rows = migrateText(text, { owner: 'this-repo' }).rows;
	assert.strictEqual(rows.find((x) => x.prefix === 'XY').stale, true);
	assert.strictEqual(rows.find((x) => x.prefix === 'RF').stale, false, 'a reference-only row is never stale here');
});

test('[migrate-offcanon] a SYNTHESISED register writes markers values can read, at the width the ids are written', () => {
	// The bootstrap wrote `<!--/-->` - a close `values` never matches - and padded to five digits regardless.
	const dir = offCanonRepo({ register: false });
	cli(['migrate-project', '--write'], dir);
	const staged = fs.readFileSync(path.join(dir, 'docs', 'project_v2', 'R_Roadmap.md'), 'utf8');
	assert.ok(staged.includes('<!--ewc3:lastXY-->XY-003<!--/ewc3:lastXY-->'), staged.split('\n').filter((l) => l.includes('XY') && l.includes('ewc3')).join('\n'));
	assert.ok(!staged.includes('<!--/-->'));
});

test('[migrate-index] rebaseRelative repoints a link whose TEXT is a code span, and nothing inside a code span', () => {
	// A downstream re-run: `[\`docs/x.md\`](../x.md)` stayed at the old depth, because the code-span guard
	// split the line before links were matched and hid the target along with the text.
	const { rebaseRelative } = require('../lib/slices');
	assert.strictEqual(rebaseRelative('[`docs/x.md`](../x.md)'), '[`docs/x.md`](../../x.md)');
	assert.strictEqual(rebaseRelative('see [a `b` c](y.md) and `[not](a.md)` here'), 'see [a `b` c](../y.md) and `[not](a.md)` here');
	assert.strictEqual(rebaseRelative('![`img`](p.png)'), '![`img`](../p.png)');
});

test('[links] a GitHub twin in FRONTMATTER still pairs with its relative link in the body', () => {
	// Migration moves a row's other cells into frontmatter and its Status into the body, so a twin that sat in
	// another cell of the same row now lives in frontmatter. Frontmatter is never link-CHECKED (DOCS-052), but
	// a twin is evidence, not a link to resolve.
	const r = crossRepo([
		'---', "title: 'x [twin](https://github.com/example-org/Sibling/blob/main/docs/X.md)'", '---', '',
		'See [x](../../Sibling/docs/X.md).', '',
	].join('\n'));
	assert.deepStrictEqual(r.problems, [], JSON.stringify(r.problems));
	assert.strictEqual(r.unverified, 1);
});

test('[migrate-index] a KEPT document with no doc: field is still linked from a Doc-column register', () => {
	// Codex P1, PR #8: the final render replaced migrate's pointer with an empty Doc cell, so a kept document
	// with valid frontmatter but no `doc:` became unreachable after adoption. An empty Doc cell links to the
	// document, from the same helper the pointer uses.
	const dir = agreeRepo({ docColumn: true });
	fs.mkdirSync(path.join(dir, 'docs', 'project', 'slices'), { recursive: true });
	fs.writeFileSync(path.join(dir, 'docs', 'project', 'slices', 'VS-4 kept notes.md'),
		'---\nid: VS-4\nstate: planned\ntitle: fourth\n---\n\nKept prose.\n');
	cli(['migrate-project', '--write'], dir);
	adopt(dir);
	const row = fs.readFileSync(path.join(dir, 'docs', 'project', 'R_Roadmap.md'), 'utf8').split('\n').find((l) => l.startsWith('| VS-4 '));
	assert.ok(row.includes('[VS-4](slices/VS-4%20kept%20notes.md)'), row);
	const check = cli(['index', '--check'], dir);
	assert.strictEqual(check.code, 0, check.out);
	assert.ok(!checkLinks(dir, { orphanRoot: 'docs' }).orphans.some((o) => o.includes('VS-4')), 'not an orphan');
});

test('[migrate-index] a filename that is not URL-safe is encoded in the pointer, and links resolves it', () => {
	// Codex, PR #8: `slices/VS-1 notes.md` in a link destination is not a link on GitHub, and the link checker
	// split it at the space. Percent-encoded, both read it; `links` decodes relative targets.
	const { pointerCell } = require('../lib/slices');
	assert.strictEqual(pointerCell('VS-1 notes (old).md'), 'See [slice notes](slices/VS-1%20notes%20%28old%29.md).');
	assert.strictEqual(pointerCell('VS-1_plain.md'), 'See [slice notes](slices/VS-1_plain.md).');
});

test('[migrate-index] quoteEvidence leaves a multi-backtick code span whole', () => {
	// Codex, PR #8: splitting on any backtick run closed `\`\`foo\` ...\`\`` at the inner backtick.
	const { quoteEvidence } = require('../lib/slices');
	assert.strictEqual(quoteEvidence('``a` [x](y)`` then [z]'), '``a` [x](y)`` then \\[z\\]');
});

test('[migrate-index] a register with no Doc column renders its pointer from ONE place', () => {
	// Empty `status:` in a register with no Doc column renders the same pointer migrate writes, so an
	// adopted register links every row to its document instead of rendering blank.
	const dir = agreeRepo({ docColumn: false });
	cli(['migrate-project', '--write'], dir);
	adopt(dir);
	const roadmap = fs.readFileSync(path.join(dir, 'docs', 'project', 'R_Roadmap.md'), 'utf8');
	const rows = roadmap.split('\n').filter((l) => /^\| VS-/.test(l));
	assert.strictEqual(rows.length, 4);
	for (const r of rows) { assert.ok(/See \[slice notes\]\(slices\/VS-\d+_[^)]+\.md\)\./.test(r), r); }
});

// ---------------------------------------------------------------------------
// DOCS-041. An adopted repository had no sanctioned way to mint. `index --write` refuses a document whose id
// the register never minted - deliberately, because a generator that can mint can mint by accident - so the
// only working path was typing the generated row by hand. `slice new` is the mint: one command derives the
// id, writes the document, renders the row into the right table and refreshes Last Used.

const MINT_ROW = (id, state, title, est) => `| ${id} | ${state} | ${title} | ${est} | [${id}](slices/${id}_${title.replace(/ /g, '_')}.md) |  |`;
const MINT_DOC = (id, state, title, est) => `---\nid: ${id}\nstate: ${state}\ntitle: ${title}\nest: ${est}\ndoc: "[${id}](slices/${id}_${title.replace(/ /g, '_')}.md)"\nstatus: ""\n---\n\n# ${id}\n`;

/** An adopted register: two sub-tables, a frozen series, a cited-only prefix, a declared prefix with no rows. */
function mintRepo() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mint-'));
	const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
	w('.ewc3-docs.json', JSON.stringify({
		exclude: ['docs/_ARCHIVE/**.md'],
		series: { widths: { VS: 3 } },
		values: {
			lastVSNum: { lastId: { prefix: 'VS' } }, lastVS: { template: { text: 'VS-${lastVSNum}' } },
			lastFIXNum: { lastId: { prefix: 'FIX' } }, lastFIX: { template: { text: 'FIX-${lastFIXNum}' } },
		},
	}, null, 2));
	w('docs/project/R_Roadmap.md', [
		'# R', '',
		'## ID Register', '',
		'| Prefix | Scope | Owner | Last Used | Series |', '| --- | --- | --- | --- | --- |',
		'| VS | global | r | <!--ewc3:lastVS-->VS-002<!--/ewc3:lastVS--> | slices |',
		'| FIX | repo-local | r | <!--ewc3:lastFIX-->FIX-1<!--/ewc3:lastFIX--> | fixes |',
		'| OPS | frozen at 8 | r | OPS-08 | retired |',
		'| XY | global | r | - | a new series |',
		'| DT | reference-only | other | - | cited, not ours |', '',
		'## Delivery Index', '',
		'### Vertical Slices', '',
		'| ID | State | Slice | Est | Doc | Status |', '| --- | --- | --- | --- | --- | --- |',
		MINT_ROW('VS-001', '⬜ planned', 'first', 'S'), MINT_ROW('VS-002', '🟨 coded', 'second', 'M'), '',
		'### Hotfixes', '',
		'| ID | State | Slice | Est | Doc | Status |', '| --- | --- | --- | --- | --- | --- |',
		MINT_ROW('FIX-1', '⬜ planned', 'a fix', 'S'), '',
		'## Notes', '', 'Nothing here.', '',
	].join('\n'));
	w('docs/project/slices/VS-001_first.md', MINT_DOC('VS-001', '⬜ planned', 'first', 'S'));
	w('docs/project/slices/VS-002_second.md', MINT_DOC('VS-002', '🟨 coded', 'second', 'M'));
	w('docs/project/slices/FIX-1_a_fix.md', MINT_DOC('FIX-1', '⬜ planned', 'a fix', 'S'));
	// The highest VS id lives ONLY in the archive. An archived id is spent, and must never be minted again.
	w('docs/_ARCHIVE/VS-007_retired_long_ago.md', '---\nid: VS-007\nstate: cancelled\ntitle: retired\n---\n');
	return dir;
}
const mintRoadmap = (dir) => fs.readFileSync(path.join(dir, 'docs', 'project', 'R_Roadmap.md'), 'utf8');
const mintConsistent = (dir) => ['index --check', 'series', 'values --check']
	.map((c) => [c, cli(c.split(' '), dir)]).filter(([, r]) => r.code !== 0).map(([c, r]) => `${c}: ${r.out}`);

test('[slice-new] the fixture is consistent before any mint', () => {
	assert.deepStrictEqual(mintConsistent(mintRepo()), []);
});

test('[slice-new] a dry run names the id, file and table, and writes nothing', () => {
	const dir = mintRepo();
	const before = mintRoadmap(dir);
	const r = cli(['slice', 'new', 'VS', 'A new thing'], dir);
	assert.strictEqual(r.code, 0, r.out);
	assert.ok(r.out.includes('VS-008') && r.out.includes('Vertical Slices') && r.out.includes('VS-008_A_new_thing.md'), r.out);
	assert.strictEqual(mintRoadmap(dir), before);
	assert.ok(!fs.existsSync(path.join(dir, 'docs', 'project', 'slices', 'VS-008_A_new_thing.md')));
});

test('[slice-new] --write mints past an ARCHIVED id, in the right table, and every check still passes', () => {
	const dir = mintRepo();
	const r = cli(['slice', 'new', 'VS', 'Title: with a colon', '--set', 'est=M', '--write'], dir);
	assert.strictEqual(r.code, 0, r.out);
	const file = path.join(dir, 'docs', 'project', 'slices', 'VS-008_Title_with_a_colon.md');
	assert.ok(fs.existsSync(file), 'VS-008, not VS-003: the archived VS-007 is spent');
	const { data } = frontmatter.read(fs.readFileSync(file, 'utf8'));
	assert.deepStrictEqual([data.id, data.title, data.est], ['VS-008', 'Title: with a colon', 'M']);
	assert.ok(/^title: "Title: with a colon"$/m.test(fs.readFileSync(file, 'utf8')), 'frontmatter quoted for strict YAML');

	const lines = mintRoadmap(dir).split('\n');
	const at = lines.findIndex((l) => l.startsWith('| VS-008 '));
	assert.ok(at > lines.findIndex((l) => l.startsWith('| VS-002 ')) && at < lines.indexOf('### Hotfixes'), 'under Vertical Slices, after VS-002');
	// The link may be inline or, in a format-clean register, a reference to a definition - either way it resolves.
	assert.ok(lines[at].includes('| M |') && lines[at].includes('[VS-008]') && mintRoadmap(dir).includes('slices/VS-008_Title_with_a_colon.md'), lines[at]);
	assert.ok(mintRoadmap(dir).includes('<!--ewc3:lastVS-->VS-008<!--/ewc3:lastVS-->'), 'Last Used refreshed');
	assert.deepStrictEqual(mintConsistent(dir), []);

	assert.strictEqual(cli(['slice', 'new', 'VS', 'Another', '--write'], dir).code, 0);
	assert.ok(fs.existsSync(path.join(dir, 'docs', 'project', 'slices', 'VS-009_Another.md')), 'the next mint is +1');
	assert.deepStrictEqual(mintConsistent(dir), []);
});

test('[slice-new] a register kept format-clean stays format-clean, so index --check passes after a mint', () => {
	// Found dogfooding on this repository: the mint added a long INLINE doc link to a register whose links
	// `format` had moved into reference definitions. The roadmap outside its rows stopped being format's
	// output, so index --check stopped accepting the formatted form for every row - and every older row
	// read as diverged. A format-clean register is formatted again after the row is inserted.
	const dir = mintRepo();
	const roadmap = path.join('docs', 'project', 'R_Roadmap.md');
	for (const [from, to] of [['VS-001_first.md', 'VS-001_a_first_slice_with_a_long_enough_name.md'], ['VS-002_second.md', 'VS-002_a_second_slice_with_a_long_enough_name.md']]) {
		const slices = path.join(dir, 'docs', 'project', 'slices');
		fs.renameSync(path.join(slices, from), path.join(slices, to));
		fs.writeFileSync(path.join(slices, to), fs.readFileSync(path.join(slices, to), 'utf8').replace(from, to));
		fs.writeFileSync(path.join(dir, roadmap), mintRoadmap(dir).replace(from, to));
	}
	assert.strictEqual(cli(['format', roadmap], dir).code, 0);
	assert.ok(mintRoadmap(dir).includes(']: slices/VS-001_a_first_slice'), 'fixture: format moved links into definitions');
	assert.strictEqual(cli(['index', '--check'], dir).code, 0, 'fixture: consistent and formatted');

	const r = cli(['slice', 'new', 'VS', 'Another slice with a long enough title to move', '--write'], dir);
	assert.strictEqual(r.code, 0, r.out);
	const check = cli(['index', '--check'], dir);
	assert.strictEqual(check.code, 0, check.out);
	assert.strictEqual(cli(['format', '--check', roadmap], dir).code, 0, 'still format-clean');
});

test('[slice-new] a value refreshed by the mint cannot leave a format-clean register unformatted', () => {
	// Codex, PR #13: formatting ran BEFORE values were refreshed, so a computed value in prose that grew across
	// a wrap boundary (FIX-1 to FIX-10) left the register unformatted. Values first, then format - as `fix` does.
	const dir = mintRepo();
	const roadmap = path.join(dir, 'docs', 'project', 'R_Roadmap.md');
	const marker = (v) => `<!--ewc3:lastFIX-->${v}<!--/ewc3:lastFIX-->`;
	const base = mintRoadmap(dir);
	let chosen = null;
	// Word lengths step by five characters, so vary the padding too until the value's growth crosses the edge.
	for (let n = 1; n < 40 && !chosen; n++) {
		for (let k = 0; k < 5 && !chosen; k++) {
			const candidate = format(base.replace('Nothing here.', `${'word '.repeat(n)}${'x'.repeat(k)} the last fix is ${marker('FIX-1')} and more words follow here to wrap.`));
			// Every occurrence, as `values` does - the register's Last Used cell holds the same marker.
			const grown = candidate.split(marker('FIX-1')).join(marker('FIX-10'));
			if (format(grown) !== grown) { chosen = candidate; }
		}
	}
	assert.ok(chosen, 'fixture: a paragraph on the wrap boundary');
	fs.writeFileSync(roadmap, chosen);
	fs.writeFileSync(path.join(dir, 'docs', '_ARCHIVE', 'FIX-9_old.md'), '---\nid: FIX-9\ntitle: old\n---\n');
	assert.deepStrictEqual(mintConsistent(dir), [], 'fixture: consistent');
	assert.strictEqual(cli(['format', '--check', 'docs/project/R_Roadmap.md'], dir).code, 0, 'fixture: format-clean');

	const r = cli(['slice', 'new', 'FIX', 'Crossing the boundary', '--write'], dir);
	assert.strictEqual(r.code, 0, r.out);
	assert.ok(mintRoadmap(dir).includes(marker('FIX-10')), 'the value moved');
	assert.strictEqual(cli(['format', '--check', 'docs/project/R_Roadmap.md'], dir).code, 0, 'still format-clean');
	assert.deepStrictEqual(mintConsistent(dir), []);
});

test('[slice-new] a prefix mints into the table holding its highest row', () => {
	const dir = mintRepo();
	assert.strictEqual(cli(['slice', 'new', 'FIX', 'Small correction', '--write'], dir).code, 0);
	const lines = mintRoadmap(dir).split('\n');
	const at = lines.findIndex((l) => l.startsWith('| FIX-2 '));
	assert.ok(at > lines.indexOf('### Hotfixes') && at < lines.indexOf('## Notes'), lines.join('\n'));
	assert.deepStrictEqual(mintConsistent(dir), []);
});

test('[slice-new] a FROZEN, cited-only or undeclared prefix is refused, and nothing is written', () => {
	for (const [prefix, why] of [['OPS', /frozen/i], ['DT', /not declared|does not own|reference/i], ['ZZ', /not declared/i]]) {
		const dir = mintRepo();
		const before = mintRoadmap(dir);
		const r = cli(['slice', 'new', prefix, 'Nope', '--write'], dir);
		assert.strictEqual(r.code, 1, `${prefix}: ${r.out}`);
		assert.ok(why.test(r.out) && r.out.includes(prefix), `${prefix}: ${r.out}`);
		assert.strictEqual(mintRoadmap(dir), before, `${prefix}: roadmap untouched`);
	}
});

test('[slice-new] a prefix with NO rows needs --table, which must name an existing sub-table', () => {
	const dir = mintRepo();
	const none = cli(['slice', 'new', 'XY', 'First of its kind', '--write'], dir);
	assert.strictEqual(none.code, 1, none.out);
	assert.ok(none.out.includes('Vertical Slices') && none.out.includes('Hotfixes'), 'names the tables to choose from');
	assert.strictEqual(cli(['slice', 'new', 'XY', 'First of its kind', '--table', 'Nope', '--write'], dir).code, 1);

	const ok = cli(['slice', 'new', 'XY', 'First of its kind', '--table', 'Hotfixes', '--write'], dir);
	assert.strictEqual(ok.code, 0, ok.out);
	const lines = mintRoadmap(dir).split('\n');
	assert.ok(lines.findIndex((l) => l.startsWith('| XY-1 ')) > lines.indexOf('### Hotfixes'));
	assert.strictEqual(cli(['index', '--check'], dir).code, 0);
});

test('[slice-new] --table that disagrees with where a prefix already lives is refused, not ignored', () => {
	const dir = mintRepo();
	const r = cli(['slice', 'new', 'VS', 'Misplaced', '--table', 'Hotfixes', '--write'], dir);
	assert.strictEqual(r.code, 1, r.out);
	assert.ok(r.out.includes('Vertical Slices'), r.out);
	assert.strictEqual(cli(['slice', 'new', 'VS', 'Placed', '--table', 'vertical slices'], dir).code, 0, 'naming the right table is fine');
});

test('[slice-new] --set takes only a real column of that table, and never a derived one', () => {
	const dir = mintRepo();
	for (const bad of ['bogus=1', 'doc=x', 'id=VS-100', 'state=done', 'title=other', 'noequals']) {
		const r = cli(['slice', 'new', 'VS', 'X', '--set', bad, '--write'], dir);
		assert.strictEqual(r.code, bad === 'noequals' ? 2 : 1, `${bad}: ${r.out}`);
	}
	assert.strictEqual(cli(['slice', 'new', 'VS'], dir).code, 2, 'a title is required');
});

test('[slice-new] a freeze recorded by ANY register is honoured, not only the first one read', () => {
	// Codex P1, PR #12: the first scope found won, so a freeze recorded by a second surface was ignored and a
	// retired number was minted.
	const dir = mintRepo();
	fs.writeFileSync(path.join(dir, 'docs', 'project', 'S_Roadmap.md'), [
		'# S', '', '## ID Register', '', '| Prefix | Scope | Owner | Last Used | Series |', '| --- | --- | --- | --- | --- |',
		'| VS | reference-only, frozen at 7 | r | VS-007 | retired here |', '',
	].join('\n'));
	const before = mintRoadmap(dir);
	const r = cli(['slice', 'new', 'VS', 'Should not mint', '--write'], dir);
	assert.strictEqual(r.code, 1, r.out);
	assert.ok(/frozen/i.test(r.out), r.out);
	assert.strictEqual(mintRoadmap(dir), before);
});

test('[slice-new] an unknown flag or a stray argument is a usage error, never silently ignored', () => {
	// Found reviewing a downstream skill: `slice new ... --slices elsewhere` ignored the flag and minted into
	// docs/project/slices, exit 0. A misspelled `--wirte` would quietly dry-run. A flag that is dropped is
	// worse than one that errors - the rule this toolkit already applies to --repo.
	const dir = mintRepo();
	const before = mintRoadmap(dir);
	for (const argv of [['--slices', 'elsewhere', '--write'], ['--wirte'], ['--check'], ['extra-positional', '--write']]) {
		const r = cli(['slice', 'new', 'VS', 'X', ...argv], dir);
		assert.strictEqual(r.code, 2, `${argv.join(' ')}: ${r.out}`);
		assert.ok(/unknown|unexpected/i.test(r.out), `${argv.join(' ')}: ${r.out}`);
	}
	assert.strictEqual(mintRoadmap(dir), before, 'nothing written');
	assert.ok(!fs.readdirSync(path.join(dir, 'docs', 'project', 'slices')).some((n) => n.startsWith('VS-008')));
});

test('[slice-new] an option given no value is a usage error, never a value', () => {
	// Codex, PR #12: `--state --write` stored the literal state "--write" and minted.
	const dir = mintRepo();
	const before = mintRoadmap(dir);
	for (const argv of [['--state', '--write'], ['--table', '--write'], ['--set', '--write']]) {
		const r = cli(['slice', 'new', 'VS', 'X', ...argv], dir);
		assert.strictEqual(r.code, 2, `${argv.join(' ')}: ${r.out}`);
	}
	assert.strictEqual(mintRoadmap(dir), before, 'nothing written');
	assert.ok(!fs.readdirSync(path.join(dir, 'docs', 'project', 'slices')).some((n) => n.startsWith('VS-008')));
});

test('[slice-new] an unheaded table is chosen by the name the refusal shows', () => {
	// Codex, PR #12: the refusal offered "(no heading)", and passing it was rejected.
	const dir = mintRepo();
	const file = path.join(dir, 'docs', 'project', 'R_Roadmap.md');
	fs.writeFileSync(file, mintRoadmap(dir).replace('### Vertical Slices\n\n', '').replace(/### Hotfixes\n\n\| ID [^\n]*\n\| ---[^\n]*\n\| FIX-1 [^\n]*\n\n/, ''));
	fs.unlinkSync(path.join(dir, 'docs', 'project', 'slices', 'FIX-1_a_fix.md'));
	const refused = cli(['slice', 'new', 'XY', 'First', '--write'], dir);
	assert.strictEqual(refused.code, 1, refused.out);
	assert.ok(refused.out.includes('(no heading)'), refused.out);
	const ok = cli(['slice', 'new', 'XY', 'First', '--table', '(no heading)', '--write'], dir);
	assert.strictEqual(ok.code, 0, ok.out);
	assert.strictEqual(cli(['index', '--check'], dir).code, 0);
});

test('[slice-new] a target table whose columns differ from the first table is refused', () => {
	// Copilot, PR #12: rows render against the FIRST table's header, so a mint into a table with other columns
	// would put values in the wrong cells.
	const dir = mintRepo();
	const file = path.join(dir, 'docs', 'project', 'R_Roadmap.md');
	fs.writeFileSync(file, mintRoadmap(dir).replace('### Hotfixes\n\n| ID | State | Slice | Est | Doc | Status |', '### Hotfixes\n\n| ID | Slice | State | Est | Doc | Status |'));
	const r = cli(['slice', 'new', 'FIX', 'Wrong columns', '--write'], dir);
	assert.strictEqual(r.code, 1, r.out);
	assert.ok(/columns/i.test(r.out), r.out);
});

test('[slice-new] with no "planned" row to copy, --state is required rather than guessed', () => {
	// Copilot, PR #12: a register whose rows are all past planning minted a bare "planned", a spelling it
	// may never use.
	const dir = mintRepo();
	const file = path.join(dir, 'docs', 'project', 'R_Roadmap.md');
	fs.writeFileSync(file, mintRoadmap(dir).split('⬜ planned').join('🟨 coded'));
	for (const n of fs.readdirSync(path.join(dir, 'docs', 'project', 'slices'))) {
		const p = path.join(dir, 'docs', 'project', 'slices', n);
		fs.writeFileSync(p, fs.readFileSync(p, 'utf8').split('⬜ planned').join('🟨 coded'));
	}
	const r = cli(['slice', 'new', 'VS', 'No legend row', '--write'], dir);
	assert.strictEqual(r.code, 1, r.out);
	assert.ok(r.out.includes('--state'), r.out);
	assert.strictEqual(cli(['slice', 'new', 'VS', 'No legend row', '--state', '⬜ planned', '--write'], dir).code, 0);
});

test('[slice-new] --set on the pointer cell of a table with no Doc column is refused', () => {
	// Copilot, PR #12: a table with no Doc column points at the document from its LAST cell when that cell is
	// empty; setting it would leave the new document unreachable. An explicit no-Doc register, so the refusal
	// is provably for this reason and not another.
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mint-nodoc-'));
	const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
	w('docs/project/R_Roadmap.md', [
		'# R', '', '## ID Register', '', '| Prefix | Scope | Owner | Last Used | Series |', '| --- | --- | --- | --- | --- |',
		'| VS | global | r | VS-1 | slices |', '',
		'## Delivery Index', '', '| ID | State | Slice | Est | Status |', '| --- | --- | --- | --- | --- |',
		'| VS-1 | planned | first | S | See [slice notes](slices/VS-1_first.md). |', '',
	].join('\n'));
	w('docs/project/slices/VS-1_first.md', '---\nid: VS-1\nstate: planned\ntitle: first\nest: S\nstatus: ""\n---\n');
	assert.strictEqual(cli(['index', '--check'], dir).code, 0, 'fixture: consistent');

	const refused = cli(['slice', 'new', 'VS', 'Hidden pointer', '--set', 'status=done', '--write'], dir);
	assert.strictEqual(refused.code, 1, refused.out);
	assert.ok(refused.out.includes('--set status: with no Doc column, that cell is the pointer'), refused.out);

	const ok = cli(['slice', 'new', 'VS', 'Visible pointer', '--set', 'est=M', '--write'], dir);
	assert.strictEqual(ok.code, 0, ok.out);
	const row = fs.readFileSync(path.join(dir, 'docs', 'project', 'R_Roadmap.md'), 'utf8').split('\n').find((l) => l.startsWith('| VS-2 '));
	const text = fs.readFileSync(path.join(dir, 'docs', 'project', 'R_Roadmap.md'), 'utf8');
	assert.ok(row.includes('See [slice notes]') && row.includes('| M |') && text.includes('slices/VS-2_Visible_pointer.md'), row);
	assert.strictEqual(cli(['index', '--check'], dir).code, 0);
});

// ---------------------------------------------------------------------------
// DOCS-036 / DOCS-038. `fold`: git trailers become slice-document state. The slice document is the object; a
// commit that did the work records `Slice: <ID>` and `State: <word>`, and fold writes the newest one into
// that document's frontmatter, from which `index` renders the row. Contract agreed with the downstream hub.

const FOLD_LEGEND = [
	'## State Legend', '',
	'- ⬜ `planned` — not started',
	'- 🟦 `coded` — source landed',
	'- 💨 `smoked` — smoke-verified',
	'- 🟩 `go` — good to go',
	'- ⏸️ `deferred` — intentionally postponed',
	'- _`tested` is **reserved** and is not a state_', '',
];

/** An adopted, committed repository with a State Legend: VS-1 and VS-2 planned. */
function foldRepo({ legend = true } = {}) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fold-'));
	const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
	w('docs/project/R_Roadmap.md', ['# R', '', ...(legend ? FOLD_LEGEND : []),
		'## Delivery Index', '', '| ID | State | Slice | Status |', '| --- | --- | --- | --- |',
		`| VS-1 | ${legend ? '⬜ planned' : 'planned'} | first | x |`, `| VS-2 | ${legend ? '⬜ planned' : 'coded'} | second | y |`, ''].join('\n'));
	w('docs/project/slices/VS-1_first.md', GATE_DOC('VS-1', legend ? '⬜ planned' : 'planned', 'first', 'x'));
	w('docs/project/slices/VS-2_second.md', GATE_DOC('VS-2', legend ? '⬜ planned' : 'coded', 'second', 'y'));
	git(dir, 'init', '-q');
	git(dir, 'add', '-A');
	git(dir, 'commit', '-qm', 'adopted');
	return dir;
}
/** A commit whose message ends in a trailer block. Empty, because trailers are what fold reads. */
function trailerCommit(dir, subject, trailers) {
	git(dir, 'commit', '--allow-empty', '-qm', subject, '-m', [...trailers, 'Co-Authored-By: t <t@t>'].join('\n'));
	return git(dir, 'rev-parse', 'HEAD');
}
const foldData = (dir, id) => frontmatter.read(fs.readFileSync(gateDoc(dir, id), 'utf8')).data;

test('[fold] parseTrailers pairs each State with the nearest Slice above it', () => {
	const { parseTrailers } = require('../lib/fold');
	assert.deepStrictEqual(parseTrailers(['Slice: VS-1', 'State: coded', 'Slice: VS-2', 'State: smoked', 'Co-Authored-By: x']),
		{ pairs: [{ slice: 'VS-1', state: 'coded' }, { slice: 'VS-2', state: 'smoked' }], errors: [] });
	assert.deepStrictEqual(parseTrailers(['Slice: VS-1', 'Slice: VS-2', 'State: go']).pairs,
		[{ slice: 'VS-1', state: null }, { slice: 'VS-2', state: 'go' }], 'a Slice with no State is a timeline event');
	assert.ok(/State: with no Slice:/.test(parseTrailers(['State: coded']).errors[0]), 'a State with no Slice is an error');
});

test('[fold] the legend is read from State Legend bullets, glyph and all, and a reserved bullet is not a state', () => {
	const { legendOf } = require('../lib/fold');
	const legend = legendOf(['# R', '', ...FOLD_LEGEND].join('\n'));
	assert.strictEqual(legend.get('smoked'), '💨 smoked');
	assert.strictEqual(legend.get('deferred'), '⏸️ deferred', 'a two-codepoint glyph survives');
	assert.ok(!legend.has('tested'), 'a reserved italic bullet is not a state');
});

test('[fold] --write folds the newest trailer into frontmatter and renders the row; a second run changes nothing', () => {
	const dir = foldRepo();
	trailerCommit(dir, '[VS-1] build it', ['Slice: VS-1', 'State: coded']);
	const sha = trailerCommit(dir, '[VS-1] ship it', ['Slice: VS-1', 'State: SMOKED']);
	const r = cli(['fold', '--write'], dir);
	assert.strictEqual(r.code, 0, r.out);
	assert.ok(r.out.includes('VS-1: ⬜ planned -> 💨 smoked'), `the id as written, not normalised:\n${r.out}`);
	const data = foldData(dir, 'VS-1');
	assert.deepStrictEqual([data.state, data.state_source, data.state_sha], ['💨 smoked', 'trailer', sha.slice(0, 12)], 'newest wins, in the legend spelling');
	assert.ok(fs.readFileSync(gateRoadmap(dir), 'utf8').includes('| VS-1 | 💨 smoked | first | x |'), 'the row is rendered');
	assert.strictEqual(cli(['index', '--check'], dir).code, 0);
	assert.strictEqual(cli(['fold', '--check'], dir).code, 0, r.out);
	const before = fs.readFileSync(gateDoc(dir, 'VS-1'), 'utf8');
	assert.strictEqual(cli(['fold', '--write'], dir).code, 0);
	assert.strictEqual(fs.readFileSync(gateDoc(dir, 'VS-1'), 'utf8'), before, 'idempotent');
});

test('[fold] --check fails when frontmatter is behind its newest trailer, naming the slice and sha, and writes nothing', () => {
	const dir = foldRepo();
	const sha = trailerCommit(dir, 'work', ['Slice: VS-2', 'State: go']);
	const before = fs.readFileSync(gateDoc(dir, 'VS-2'), 'utf8');
	const r = cli(['fold', '--check'], dir);
	assert.strictEqual(r.code, 1, r.out);
	assert.ok(r.out.includes('VS-2') && r.out.includes(sha.slice(0, 12)), r.out);
	assert.strictEqual(fs.readFileSync(gateDoc(dir, 'VS-2'), 'utf8'), before);
});

test('[fold] DOCS-070: a dry run names every provenance update --write will make, not only state changes', () => {
	// VS-1 is already planned, so a `State: planned` trailer changes no state - but --write records its sha and
	// source. The dry run listed only changes, so --write reported writes the dry run never mentioned.
	const dir = foldRepo();
	const sha = trailerCommit(dir, 'confirm', ['Slice: VS-1', 'State: planned']);
	const dry = cli(['fold'], dir);
	assert.strictEqual(dry.code, 0, dry.out);
	assert.ok(/VS-1: .*planned/.test(dry.out) && dry.out.includes(sha.slice(0, 12)), `the provenance update is named:\n${dry.out}`);
	assert.ok(dry.out.includes('dry run'), dry.out);
	const write = cli(['fold', '--write'], dir);
	assert.ok(write.out.includes('0 state change(s) and 1 provenance update(s)'), write.out);
	assert.ok(!cli(['fold', '--check'], dir).out.includes(sha.slice(0, 12)), '--check does not list provenance: it never fails on it');
});

test('DOCS-070: --help on any command prints that command\'s usage, exits 0, and RUNS NOTHING', () => {
	// `fold --help` and `slice new --help` were refused as unknown options; worse, `format --help`, `values --help`
	// and `fix --help` ignored the flag and ran - writing files - on a request for help.
	const dir = foldRepo();
	const long = `${'word '.repeat(40)}\n`;
	fs.writeFileSync(path.join(dir, 'README.md'), `# R\n\n${long}`);
	const snapshot = () => ['README.md', 'docs/project/R_Roadmap.md'].map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
	const before = snapshot();
	for (const args of [['format'], ['links'], ['values'], ['series'], ['migrate-project'], ['tables'], ['index'],
		['slice', 'new'], ['fold'], ['fix'], ['check']]) {
		for (const flag of ['--help', '-h']) {
			const r = cli([...args, flag, '--write'], dir);
			assert.strictEqual(r.code, 0, `${args.join(' ')} ${flag}:\n${r.out}`);
			assert.ok(r.out.includes(`ewc3-docs ${args.join(' ')}`), `${args.join(' ')} ${flag} prints its usage:\n${r.out}`);
		}
	}
	assert.deepStrictEqual(snapshot(), before, 'nothing was written');
	assert.ok(!fs.existsSync(path.join(dir, 'docs', 'project_v2')), 'migrate-project --help staged nothing');
	// With no command, the flag IS the command slot (Codex, PR #19): usage, exit 0 - not "unknown command", 2.
	for (const flag of ['--help', '-h']) {
		const r = cli([flag], dir);
		assert.strictEqual(r.code, 0, `ewc3-docs ${flag}:\n${r.out}`);
		assert.ok(r.out.includes('ewc3-docs fold'), r.out);
	}
	assert.strictEqual(cli(['no-such-command'], dir).code, 2, 'an unknown command still did not run');
});

test('[fold] one commit may advance several slices; ids match padding-insensitively', () => {
	const dir = foldRepo();
	trailerCommit(dir, 'both', ['Slice: VS-001', 'State: coded', 'Slice: VS-2', 'State: deferred']);
	assert.strictEqual(cli(['fold', '--write'], dir).code, 0);
	assert.strictEqual(foldData(dir, 'VS-1').state, '🟦 coded');
	assert.strictEqual(foldData(dir, 'VS-2').state, '⏸️ deferred');
});

test('[fold] state_source: human is never overwritten, and the conflict is named', () => {
	const dir = foldRepo();
	swap(gateDoc(dir, 'VS-1'), 'state: ⬜ planned', 'state: ⏸️ deferred\nstate_source: human');
	git(dir, 'commit', '-qam', 'a person decided');
	trailerCommit(dir, 'work', ['Slice: VS-1', 'State: coded']);
	const r = cli(['fold', '--write'], dir);
	assert.strictEqual(r.code, 0, r.out);
	assert.strictEqual(foldData(dir, 'VS-1').state, '⏸️ deferred');
	assert.ok(/human/.test(r.out) && r.out.includes('VS-1'), r.out);
	assert.strictEqual(cli(['fold', '--check'], dir).code, 0, 'a human decision is current by definition');
});

test('[fold] DOCS-038: a malformed trailer is an ERROR after --since, and a warning in full history', () => {
	// History cannot be rewritten, so a full-history check that failed on one old mistake would stay red forever.
	for (const [trailers, why] of [[['Slice: VS-9', 'State: coded'], /no slice document/], [['Slice: VS-1', 'State: shipped'], /not in the legend/], [['State: coded'], /State: with no Slice:/]]) {
		const dir = foldRepo();
		const base = git(dir, 'rev-parse', 'HEAD');
		const sha = trailerCommit(dir, 'mislabelled', trailers);
		const pr = cli(['fold', '--check', '--since', base], dir);
		assert.strictEqual(pr.code, 1, `${trailers}: ${pr.out}`);
		assert.ok(why.test(pr.out) && pr.out.includes(sha.slice(0, 12)), pr.out);
		const full = cli(['fold', '--check'], dir);
		assert.strictEqual(full.code, 0, `${trailers}: ${full.out}`);
		assert.ok(/warning/i.test(full.out) && why.test(full.out), full.out);
	}
});

test('[fold] a slice with no trailer is never touched - frontmatter states outside the legend stay as written', () => {
	const dir = foldRepo();
	swap(gateDoc(dir, 'VS-2'), 'state: ⬜ planned', 'state: ✅ done');
	swap(gateRoadmap(dir), '| VS-2 | ⬜ planned |', '| VS-2 | ✅ done |');
	git(dir, 'commit', '-qam', 'legacy state');
	trailerCommit(dir, 'work', ['Slice: VS-1', 'State: coded']);
	assert.strictEqual(cli(['fold', '--write'], dir).code, 0);
	assert.strictEqual(foldData(dir, 'VS-2').state, '✅ done');
	assert.strictEqual(cli(['fold', '--check'], dir).code, 0);
});

test('[fold] with no State Legend, a word takes the spelling the register already uses', () => {
	const dir = foldRepo({ legend: false });
	trailerCommit(dir, 'work', ['Slice: VS-1', 'State: Coded']);
	assert.strictEqual(cli(['fold', '--write'], dir).code, 0);
	assert.strictEqual(foldData(dir, 'VS-1').state, 'coded');
});

test('[fold] a trailer merged in from a branch counts', () => {
	const dir = foldRepo();
	git(dir, 'checkout', '-qb', 'feature/VS-1');
	trailerCommit(dir, 'on the branch', ['Slice: VS-1', 'State: go']);
	git(dir, 'checkout', '-q', '-');
	git(dir, 'merge', '-q', '--no-ff', '-m', 'merge', 'feature/VS-1');
	assert.strictEqual(cli(['fold', '--write'], dir).code, 0);
	assert.strictEqual(foldData(dir, 'VS-1').state, '🟩 go');
});

test('[fold] NO REGISTER is an explicit no-op; a register with no slices still checks; a half-adopted repo does not run', () => {
	// Ruled downstream: a repository with no register may carry `Slice:` trailers as EVIDENCE for another
	// repository's slices, and must never fail on them. Distinct from a register with zero slices.
	const none = fs.mkdtempSync(path.join(os.tmpdir(), 'fold-none-'));
	fs.writeFileSync(path.join(none, 'README.md'), '# app\n');
	git(none, 'init', '-q');
	git(none, 'add', '-A');
	git(none, 'commit', '-qm', 'app');
	const base = git(none, 'rev-parse', 'HEAD');
	trailerCommit(none, 'evidence for another repository', ['Slice: VS-900', 'State: coded']);
	for (const argv of [['--check'], ['--check', '--since', base], ['--write'], []]) {
		const r = cli(['fold', ...argv], none);
		assert.strictEqual(r.code, 0, `${argv.join(' ')}: ${r.out}`);
		assert.ok(/no register/i.test(r.out), r.out);
	}

	const empty = foldRepo();
	for (const n of fs.readdirSync(path.join(empty, 'docs', 'project', 'slices'))) { fs.unlinkSync(path.join(empty, 'docs', 'project', 'slices', n)); }
	fs.writeFileSync(path.join(empty, 'docs', 'project', 'slices', 'README.md'), '# slices\n');
	git(empty, 'add', '-A');
	git(empty, 'commit', '-qm', 'no slices yet');
	const emptyBase = git(empty, 'rev-parse', 'HEAD');
	trailerCommit(empty, 'mislabel', ['Slice: VS-9', 'State: coded']);
	const zero = cli(['fold', '--check', '--since', emptyBase], empty);
	assert.strictEqual(zero.code, 1, zero.out);
	assert.ok(/no slice document/.test(zero.out) && !/no register/i.test(zero.out), zero.out);

	// A register kept as hand-edited ROWS (a Delivery Index, no slice documents) is a legitimate mode, not a
	// broken adoption: nothing to fold, exit 0 (ruled downstream - most of an estate runs this way).
	const rows = foldRepo();
	fs.rmSync(path.join(rows, 'docs', 'project', 'slices'), { recursive: true, force: true });
	const rowsRun = cli(['fold', '--check'], rows);
	assert.strictEqual(rowsRun.code, 0, rowsRun.out);
	assert.ok(/rows register/i.test(rowsRun.out), rowsRun.out);

	// A DECLARED mode that the documents contradict did not run - either way round. Adoption is read off the
	// documents, so deleting a declaration can never turn a check green.
	const declaredSlices = foldRepo();
	fs.rmSync(path.join(declaredSlices, 'docs', 'project', 'slices'), { recursive: true, force: true });
	fs.writeFileSync(path.join(declaredSlices, '.ewc3-docs.json'), JSON.stringify({ planning: 'slice-documents' }));
	const r1 = cli(['fold', '--check'], declaredSlices);
	assert.strictEqual(r1.code, 2, r1.out);
	assert.ok(/did not run/.test(r1.out) && /slice-documents/.test(r1.out), r1.out);

	const declaredRows = foldRepo();
	fs.writeFileSync(path.join(declaredRows, '.ewc3-docs.json'), JSON.stringify({ planning: 'roadmap-rows' }));
	const r2 = cli(['fold', '--check'], declaredRows);
	assert.strictEqual(r2.code, 2, r2.out);
	assert.ok(/did not run/.test(r2.out) && /roadmap-rows/.test(r2.out), r2.out);

	const bogus = foldRepo();
	fs.writeFileSync(path.join(bogus, '.ewc3-docs.json'), JSON.stringify({ planning: 'slices' }));
	assert.strictEqual(cli(['fold', '--check'], bogus).code, 2, 'an unknown planning value is refused');
});

test('[fold] when the index gate refuses the row, the frontmatter is rolled back - all or nothing', () => {
	// Codex P1, PR #15: frontmatter was written before `index --write` refused a hand-edited row, so fold exited
	// 1 saying nothing was written while the document had already changed.
	const dir = foldRepo();
	swap(gateRoadmap(dir), '| VS-1 | ⬜ planned | first | x |', '| VS-1 | ⬜ planned | typed by hand | x |');
	trailerCommit(dir, 'work', ['Slice: VS-1', 'State: coded']);
	const doc = fs.readFileSync(gateDoc(dir, 'VS-1'), 'utf8');
	const roadmap = fs.readFileSync(gateRoadmap(dir), 'utf8');
	const r = cli(['fold', '--write'], dir);
	assert.strictEqual(r.code, 1, r.out);
	assert.ok(/rolled back/i.test(r.out), r.out);
	assert.strictEqual(fs.readFileSync(gateDoc(dir, 'VS-1'), 'utf8'), doc, 'the document is untouched');
	assert.strictEqual(fs.readFileSync(gateRoadmap(dir), 'utf8'), roadmap, 'and so is the row');
});

test('[fold] a state word two State Legends spell differently is refused, not decided by file order', () => {
	// Codex P2, PR #15: the first legend read won, so the spelling depended on glob order.
	const dir = foldRepo();
	fs.writeFileSync(path.join(dir, 'docs', 'project', 'S_Roadmap.md'), ['# S', '', '## State Legend', '', '- 🟨 `coded` — elsewhere', ''].join('\n'));
	git(dir, 'add', '-A');
	git(dir, 'commit', '-qm', 'second register');
	const base = git(dir, 'rev-parse', 'HEAD');
	trailerCommit(dir, 'work', ['Slice: VS-1', 'State: coded']);
	const r = cli(['fold', '--check', '--since', base], dir);
	assert.strictEqual(r.code, 1, r.out);
	assert.ok(/coded/.test(r.out) && /🟦 coded/.test(r.out) && /🟨 coded/.test(r.out), r.out);
	assert.strictEqual(cli(['fold', '--write'], dir).code, 0, 'no --since: a warning, and nothing folded');
	assert.strictEqual(foldData(dir, 'VS-1').state, '⬜ planned');
});

test('[fold] outside a git work tree, fold does not run', () => {
	const dir = foldRepo();
	fs.rmSync(path.join(dir, '.git'), { recursive: true, force: true });
	assert.strictEqual(cli(['fold', '--check'], dir).code, 2);
});

test('[slices] normalizeId: zero-padding never makes two ids of one slice', () => {
	const { normalizeId } = require('../lib/slices');
	assert.strictEqual(normalizeId('VS-4'), 'VS-4');
	assert.strictEqual(normalizeId('VS-00004'), 'VS-4');
	assert.strictEqual(normalizeId(' vs-004 '), null, 'a lowercase prefix is not an id');
	assert.strictEqual(normalizeId('VS-004a'), 'VS-4a');
	assert.strictEqual(normalizeId('VS-0'), 'VS-0');
	assert.strictEqual(normalizeId('not an id'), null);
});

/** A roadmap with five rows and a live slices folder holding the ways an older document falls short. */
function legacyRepo(extra = {}) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-'));
	const project = path.join(dir, 'docs', 'project');
	fs.mkdirSync(path.join(project, 'slices'), { recursive: true });
	fs.writeFileSync(path.join(project, 'R_Roadmap.md'), [
		'# R', '',
		'## Delivery Index', '',
		'| ID | State | Slice | Status |', '| --- | --- | --- | --- |',
		'| VS-1 | planned | no frontmatter at all | a |',
		'| VS-2 | planned | frontmatter without id | b |',
		'| VS-3 | planned | malformed frontmatter | c |',
		'| VS-4 | planned | id padded differently | d |',
		'| VS-5 | planned | proper frontmatter | e |', '',
		'## Slice Notes', '',
		'### VS-1 — no frontmatter at all', '', 'Roadmap narrative one.', '',
	].join('\n'));
	const docs = {
		'VS-1_no_frontmatter_at_all.md': '# VS-1 — no frontmatter at all\n\nPROSE ONE.\n',
		'VS-2-old-name.md': '---\ntitle: frontmatter without id\n---\n\n# VS-2\n\nPROSE TWO.\n',
		'VS-3_malformed.md': '---\nid: VS-3\n  nested: x\n---\n\n# VS-3\n\nPROSE THREE.\n',
		'VS-004_padded.md': '---\nid: VS-004\nstate: planned\ntitle: id padded differently\n---\n\nPROSE FOUR.\n',
		'VS-5_proper.md': '---\nid: VS-5\nstate: planned\ntitle: proper frontmatter\n---\n\nPROSE FIVE.\n',
		'design-notes.md': 'No id anywhere.\n\nPROSE SIX.\n',
		...extra,
	};
	for (const [name, body] of Object.entries(docs)) {
		if (body === null) { continue; }
		fs.mkdirSync(path.dirname(path.join(project, 'slices', name)), { recursive: true });
		fs.writeFileSync(path.join(project, 'slices', name), body);
	}
	return { dir, docs };
}
const stagedSlices = (dir) => path.join(dir, 'docs', 'project_v2', 'slices');
function filesUnder(root) {
	const out = [];
	for (const e of fs.readdirSync(root, { withFileTypes: true })) {
		const p = path.join(root, e.name);
		if (e.isDirectory()) { out.push(...filesUnder(p)); } else { out.push(p); }
	}
	return out;
}

test('[migrate-legacy] every existing slice document reaches the staged tree BYTE-FOR-BYTE', () => {
	// The property that matters: adopting docs/project_v2 in one move loses nothing a human wrote. Kept
	// documents used to stay only in the live tree, so the documented "replace docs/project/" deleted them.
	//
	// Walks EVERY live file, not a list of expected ones. Codex (PR #7): `VS-6_notes.MD` was skipped by a
	// case-sensitive `.md` filter, and anything that is not markdown - an image a document embeds - was
	// never staged at all. A list of expected names cannot catch the file nobody expected.
	const { dir } = legacyRepo({ 'VS-6_notes.MD': '# VS-6\n\nPROSE SEVEN, UPPERCASE EXTENSION.\n' });
	const live = path.join(dir, 'docs', 'project', 'slices');
	fs.mkdirSync(path.join(live, 'assets'), { recursive: true });
	fs.writeFileSync(path.join(live, 'assets', 'diagram.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255]));
	cli(['migrate-project', '--write'], dir);
	const staged = filesUnder(stagedSlices(dir)).map((f) => fs.readFileSync(f));
	for (const file of filesUnder(live)) {
		const bytes = fs.readFileSync(file);
		assert.ok(staged.some((s) => s.equals(bytes)), `${path.relative(live, file)} is not in the staged tree verbatim`);
	}
	assert.ok(fs.existsSync(path.join(stagedSlices(dir), 'assets', 'diagram.png')), 'a non-markdown file keeps its path');
});

test('[migrate-legacy] a padded id is the SAME slice - VS-004 is kept for row VS-4, not regenerated', () => {
	const { dir } = legacyRepo();
	const r = cli(['migrate-project', '--write'], dir);
	const names = fs.readdirSync(stagedSlices(dir));
	assert.ok(names.includes('VS-004_padded.md'), names.join(' '));
	assert.ok(!names.some((n) => /^VS-0*4_id_padded/.test(n)), `a second VS-4 document was generated: ${names.join(' ')}`);
	const roadmap = fs.readFileSync(path.join(dir, 'docs', 'project_v2', 'R_Roadmap.md'), 'utf8');
	assert.ok(roadmap.includes('slices/VS-004_padded.md'), 'the row points at the existing document');
	assert.ok(/kept/.test(r.out), r.out);
});

test('[migrate-legacy] a document WITHOUT usable frontmatter is backed up verbatim and linked, never overwritten', () => {
	const { dir, docs } = legacyRepo();
	cli(['migrate-project', '--write'], dir);
	const legacy = path.join(stagedSlices(dir), '_legacy');
	for (const name of ['VS-1_no_frontmatter_at_all.md', 'VS-2-old-name.md', 'VS-3_malformed.md']) {
		assert.strictEqual(fs.readFileSync(path.join(legacy, name), 'utf8'), docs[name], `${name} backup`);
	}
	// The generated VS-1 document takes the legacy file's own name - so the backup is what keeps the prose,
	// and the generated document must say where it went.
	const generated = fs.readFileSync(path.join(stagedSlices(dir), 'VS-1_no_frontmatter_at_all.md'), 'utf8');
	assert.ok(generated.includes('_legacy/VS-1_no_frontmatter_at_all.md'), generated);
	const two = fs.readdirSync(stagedSlices(dir)).find((n) => /^VS-0*2_/.test(n));
	assert.ok(fs.readFileSync(path.join(stagedSlices(dir), two), 'utf8').includes('_legacy/VS-2-old-name.md'));
});

test('[migrate-legacy] the inventory names EVERY existing document and what was done with it', () => {
	const { dir } = legacyRepo();
	const r = cli(['migrate-project'], dir);
	const inv = r.out.slice(r.out.indexOf('inventory'));
	for (const [name, what] of [
		['VS-1_no_frontmatter_at_all.md', /no frontmatter/],
		['VS-2-old-name.md', /no id: in frontmatter/],
		['VS-3_malformed.md', /unreadable frontmatter/],
		['VS-004_padded.md', /kept/],
		['VS-5_proper.md', /kept/],
		['design-notes.md', /no id.*not a slice document/],
	]) {
		const line = inv.split('\n').find((l) => l.includes(name));
		assert.ok(line, `${name} missing from the inventory:\n${r.out}`);
		assert.ok(what.test(line), `${name}: ${line}`);
	}
	assert.ok(!fs.existsSync(path.join(dir, 'docs', 'project_v2')), 'a dry run writes nothing');
});

test('[migrate-legacy] two documents for ONE slice refuse the migration, naming both - padding included', () => {
	for (const extra of [
		{ 'VS-5_second.md': '---\nid: VS-005\ntitle: other\n---\n' },
		{ 'VS-0001_older.md': 'Also VS-1, no frontmatter.\n' },
	]) {
		const { dir } = legacyRepo(extra);
		const r = cli(['migrate-project', '--write'], dir);
		const second = Object.keys(extra)[0];
		assert.strictEqual(r.code, 1, r.out);
		assert.ok(/more than one document/.test(r.out) && r.out.includes(second), r.out);
		assert.ok(!fs.existsSync(path.join(dir, 'docs', 'project_v2')), `nothing written:\n${r.out}`);
	}
});

test('[migrate-legacy] a kept document\'s filename is never overwritten by ANOTHER slice\'s generated one', () => {
	// Codex, PR #7. A kept document keeps its freely chosen name; when that name is exactly what another
	// row generates (VS-2_frontmatter_without_id.md declaring VS-5 here), the verbatim copy replaced the
	// generated document and both rows pointed at one file. The generated one is renamed instead.
	const { dir, docs } = legacyRepo({
		'VS-5_proper.md': null,
		'VS-2_frontmatter_without_id.md': '---\nid: VS-5\ntitle: proper frontmatter\n---\n\nPROSE FIVE, ODDLY NAMED.\n',
		'VS-2-old-name.md': null,
	});
	cli(['migrate-project', '--write'], dir);
	const staged = stagedSlices(dir);
	assert.strictEqual(fs.readFileSync(path.join(staged, 'VS-2_frontmatter_without_id.md'), 'utf8'),
		docs['VS-2_frontmatter_without_id.md'], 'the kept document is staged verbatim');
	const two = fs.readdirSync(staged).filter((n) => /^VS-0*2_/.test(n) && n !== 'VS-2_frontmatter_without_id.md');
	assert.strictEqual(two.length, 1, `VS-2 still gets its own document: ${fs.readdirSync(staged).join(' ')}`);
	assert.ok(/^id: VS-0*2$/m.test(fs.readFileSync(path.join(staged, two[0]), 'utf8')));
	const roadmap = fs.readFileSync(path.join(dir, 'docs', 'project_v2', 'R_Roadmap.md'), 'utf8');
	assert.ok(roadmap.includes(`slices/${two[0]}`), 'row VS-2 points at the renamed document');
});

test('[migrate-legacy] a backup never overwrites a live _legacy/ file of the same name - it is renamed', () => {
	// Codex P1, PR #7. A repo adopted once already has slices/_legacy/. Backing up a top-level document of
	// the same name, then copying the live _legacy/ file over it, lost the top-level prose, and the
	// generated document linked to the wrong file.
	const older = 'AN EARLIER ADOPTION\'S BACKUP.\n';
	const { dir, docs } = legacyRepo({ '_legacy/VS-1_no_frontmatter_at_all.md': older });
	cli(['migrate-project', '--write'], dir);
	const legacyDir = path.join(stagedSlices(dir), '_legacy');
	assert.strictEqual(fs.readFileSync(path.join(legacyDir, 'VS-1_no_frontmatter_at_all.md'), 'utf8'), older,
		'the live _legacy file is staged verbatim at its own path');
	const generated = fs.readFileSync(path.join(stagedSlices(dir), 'VS-1_no_frontmatter_at_all.md'), 'utf8');
	const link = /\]\((_legacy\/[^)]+)\)/.exec(generated);
	assert.ok(link && link[1] !== '_legacy/VS-1_no_frontmatter_at_all.md', `renamed backup: ${generated}`);
	assert.strictEqual(fs.readFileSync(path.join(stagedSlices(dir), link[1]), 'utf8'),
		docs['VS-1_no_frontmatter_at_all.md'], 'and the link reaches THIS document\'s prose');
});

test('[migrate-legacy] roadmap narrative for a slice with a KEPT document is backed up, not replaced by a link', () => {
	// Codex P1, PR #7. A kept document is never regenerated, so the Slice Notes narrative that would have
	// gone into the generated one went nowhere - yet the section was still replaced by a link. Adoption
	// lost the prose. Padded (VS-004 for row VS-4) and exact (VS-5) matches both.
	const { dir, docs } = legacyRepo();
	fs.appendFileSync(path.join(dir, 'docs', 'project', 'R_Roadmap.md'), [
		'### VS-4 — id padded differently', '', 'ROADMAP NARRATIVE FOUR.', '',
		'### VS-5 — proper frontmatter', '', 'ROADMAP NARRATIVE FIVE.', '',
	].join('\n'));
	cli(['migrate-project', '--write'], dir);
	const staged = filesUnder(stagedSlices(dir)).map((f) => ({ f, text: fs.readFileSync(f, 'utf8') }));
	const roadmap = fs.readFileSync(path.join(dir, 'docs', 'project_v2', 'R_Roadmap.md'), 'utf8');
	for (const [prose, kept] of [['ROADMAP NARRATIVE FOUR.', 'VS-004_padded.md'], ['ROADMAP NARRATIVE FIVE.', 'VS-5_proper.md']]) {
		const holder = staged.find((s) => s.text.includes(prose) && !s.f.endsWith(kept));
		assert.ok(holder, `${prose} is not in the staged tree`);
		const rel = path.relative(stagedSlices(dir), holder.f).split(path.sep).join('/');
		assert.ok(roadmap.includes(`slices/${rel}`), `the roadmap links the backup ${rel}:\n${roadmap}`);
		assert.strictEqual(fs.readFileSync(path.join(stagedSlices(dir), kept), 'utf8'), docs[kept], `${kept} untouched`);
	}
});

test('[index] a slice document with an uppercase .MD extension is read', () => {
	// Codex P2, PR #7: migration keeps VS-1_one.MD, but index enumerated `.md` case-sensitively, so after
	// adoption the slice read as undeclared.
	const dir = stagedRepo();
	const slices = path.join(dir, 'docs', 'project_v2', 'slices');
	fs.renameSync(path.join(slices, 'VS-1_first.md'), path.join(slices, 'VS-1_first.MD'));
	const r = cli(['index'], dir);
	assert.ok(/1 declaring/.test(r.out), r.out);
});

test('[migrate-legacy] a second run leaves no stale backup behind', () => {
	const { dir } = legacyRepo();
	cli(['migrate-project', '--write'], dir);
	assert.ok(fs.existsSync(path.join(stagedSlices(dir), '_legacy', 'VS-2-old-name.md')), 'fixture: backed up on the first run');
	fs.unlinkSync(path.join(dir, 'docs', 'project', 'slices', 'VS-2-old-name.md'));
	cli(['migrate-project', '--write'], dir);
	assert.ok(!fs.existsSync(path.join(stagedSlices(dir), '_legacy', 'VS-2-old-name.md')));
});

test('[migrate-legacy] a document with no id ANYWHERE is not a slice - staged in place, not backed up as legacy', () => {
	// Downstream census, 2026-09-17: the slices folder README.md in all four repositories that had one went
	// to _legacy/, so adopting the staged tree removed it from slices/. With no id in frontmatter or
	// filename it is not a slice document at all; it is copied verbatim to where it was.
	const readme = '# Slices\n\nOne document per slice. Edit the document, never the row.\n';
	const { dir, docs } = legacyRepo({ 'README.md': readme });
	const r = cli(['migrate-project', '--write'], dir);
	const staged = stagedSlices(dir);
	for (const name of ['README.md', 'design-notes.md']) {
		assert.strictEqual(fs.readFileSync(path.join(staged, name), 'utf8'), docs[name], `${name} staged in place`);
		assert.ok(!fs.existsSync(path.join(staged, '_legacy', name)), `${name} is not legacy`);
	}
	const line = r.out.split('\n').find((l) => l.includes('README.md') && l.includes('->'));
	assert.ok(line && /not a slice document/.test(line), r.out);
});

test('[migrate-legacy] the inventory shows an id AS WRITTEN, so a grep for it finds the line', () => {
	// Downstream census: the inventory printed XX-12 while the filename, the row and the frontmatter all
	// said XX-012. Matching stays padding-insensitive; only the display changes.
	const { dir } = legacyRepo({ 'VS-0006_no_row.md': 'An older document, id in the filename only.\n' });
	const r = cli(['migrate-project'], dir);
	assert.ok(/VS-004_padded\.md\s+VS-004\s/.test(r.out), r.out);
	assert.ok(/VS-0006_no_row\.md\s+VS-0006\s/.test(r.out), r.out);
});

test('[slices] a row links to its OWN document, not the anchor\'s', () => {
	// P2. Every member of a group gets its own document, but the row rewrite used the anchor-only
	// `g.file` for all of them - so a follower row pointed at the anchor and that follower own
	// document had no row pointing at it, making its frontmatter and history unreachable from the
	// index that exists to be a projection of exactly those documents.
	const src = [
		'## Delivery Index', '',
		'| ID | State | Slice | Status |', '| --- | --- | --- | --- |',
		'| VS-1 | coded | first | x |', '| VS-2 | planned | second | y |', '',
		'## Slice Notes', '', '### VS-1, VS-2 — one narrative', '', 'Body.', '',
	].join('\n');
	const r = extractSlices(src, { width: 0 });
	const rows = r.text.split('\n').filter((l) => /^\| VS-/.test(l));
	assert.ok(rows[0].includes('slices/VS-1_first.md'));
	assert.ok(rows[1].includes('slices/VS-2_second.md'),
		'the follower row must point at ITS document, not the anchor');
});

test('[slices] a LOWERCASE suffix is a distinct id, not a decoration', () => {
	// The id regex captured `[A-Z]?`, so `VS-203a` did not match and the ROW WAS SILENTLY DROPPED.
	// Eleven authored rows in SX_Coder were invisible to every check in this toolkit: the collision
	// check could not see them, `declaredIds` folded VS-203a/b/c into VS-203, and migrate-project
	// emitted ONE document for four separate commitments.
	//
	// They are ids rather than annotations, and the proof is that they carry INDEPENDENT STATES -
	// VS-203c is planned while VS-203a and VS-203b are coded. A revision-of shares its parent state.
	const src = [
		'## Delivery Index',
		'',
		'| ID | State | Slice |',
		'| --- | --- | --- |',
		'| VS-203 | coded | the wheel |',
		'| VS-203a | coded | wire check_demo_match |',
		'| VS-203c | planned | activate DemoWait routing |',
	].join('\n');
	const rows = parseIndex(src.split('\n'));
	assert.deepStrictEqual(rows.map((r) => r.id), ['VS-203', 'VS-203a', 'VS-203c']);
	assert.strictEqual(rows[2].state, 'planned', 'and it keeps its own state, which is why it is an id');
});

test('[slices] a -R<n> revision is a distinct id too', () => {
	// FIX-09-R1 is smoked while FIX-09 is coded. Different titles, different lifecycles, separately
	// committed - so the grammar has to admit it or the register loses a commitment.
	const src = [
		'## Delivery Index',
		'',
		'| ID | State | Slice |',
		'| --- | --- | --- |',
		'| FIX-09 | coded | dirty save guard |',
		'| FIX-09-R1 | smoked | guard expansion across all paths |',
	].join('\n');
	const rows = parseIndex(src.split('\n'));
	assert.deepStrictEqual(rows.map((r) => r.id), ['FIX-09', 'FIX-09-R1']);
	assert.strictEqual(rows[1].suffix, '-R1');
});

test('[slices] canonical padding applies to the NUMBER only; the suffix appends', () => {
	// `VS-09a` is canonical at a minimum of two, not `VS-9a` and not `VS-009a`. Padding is a
	// rendering rule for the numeric part and must never reach the suffix.
	assert.strictEqual(padId('VS', 9, 'a', 2), 'VS-09a');
	assert.strictEqual(padId('VS', 203, 'a', 2), 'VS-203a');
	assert.strictEqual(padId('FIX', 9, '-R1', 2), 'FIX-09-R1');
	assert.strictEqual(padId('DW', 24, '', 3), 'DW-024');
});

test('[slices] the suffix grammar is defined ONCE', () => {
	// It was spelled out in 18 places across four files in four different forms, and it had already
	// drifted - this suite uses `VS-33A`, so the grammar decided suffixes were uppercase while the
	// estate writes them lowercase. A key assembled from parts in N places drifts silently; the fix
	// is ONE builder, not N correct copies.
	const slices = require('../lib/slices');
	assert.strictEqual(typeof slices.ID_SUFFIX, 'string');
	assert.ok(slices.idPattern('^', '$', '').test('VS-203a'));
	assert.ok(slices.idPattern('^', '$', '').test('FIX-09-R1'));
	assert.ok(slices.idPattern('^', '$', '').test('VS-33A'), 'the uppercase form still works');
	assert.ok(!slices.idPattern('^', '$', '').test('VS-203abc'), 'but not arbitrary trailing text');

	// The grammar reaches the OTHER modules rather than being re-spelled in them.
	const di = require('../lib/deliveryindex');
	const rendered = di.renderRow(['ID', 'State', 'Slice'], { id: 0, state: 1, title: 2 },
		{ id: 'VS-203a', state: 'coded', title: 'x' }, null);
	assert.ok(rendered.includes('VS-203a'));
});

test('[slices] a column is found by its HEADER NAME, not its position', () => {
	// Position was hardcoded as state=1, title=2 against the house style `| ID | State | Slice |`.
	// HDCTranslators writes `| ID | Title | State |`, so every document generated for it was named
	// after its STATE: HDC-00001_done.md, HDC-00002_done.md, all the way down. Nothing errored and
	// the output looked plausible enough to sit on disk unnoticed.
	const r = extractSlices(HDC_SHAPE, { width: 0 });
	const doc = r.docs.find((d) => d.ids[0] === 'HDC-1');
	assert.strictEqual(doc.data.title, 'the burster');
	assert.strictEqual(doc.data.state, '**done**');
	assert.ok(!/_done\.md$/.test(doc.file), 'the filename must come from the title, not the state');
});

test('[slices] a heading declares only its LEADING RUN of ids', () => {
	// `### HDC-13 — VS-413: the lookup...` was declaring VS-413 too, which is an SX_Coder slice.
	// Adopting that migration would have written a cross-repo mint into a second register - the
	// same collision class that cost 26 ids when AIR and SX_Coder both owned VS-.
	//
	// A heading names its slice and then TALKS about it. Commas and range words join ids; an
	// em-dash or a colon ends the declaration and begins the label.
	const r = extractSlices(HDC_SHAPE, { width: 0 });
	const doc = r.docs.find((d) => d.ids[0] === 'HDC-13');
	assert.deepStrictEqual(doc.ids, ['HDC-13'], 'VS-413 is cited by that heading, not minted by it');
	assert.ok(!r.docs.some((d) => d.ids[0].startsWith('VS-')));
});

test('[slices] an AUTHORED document is never regenerated, and the row points at it', () => {
	// Migration is a one-time import, but a repo part-way through adoption has both kinds: rows
	// nobody has written up, and documents somebody HAS. Regenerating the second kind overwrites
	// human prose with a projection of the row that prose replaced - and on the second run, with no
	// diff to notice, because the generated text is stable.
	//
	// The name is taken from the existing file rather than derived from the row: deriving it would
	// emit a SECOND document for the same id under a different slug, which is two declaring
	// surfaces for one commitment - the exact defect this model removes, built by the tool that
	// implements it.
	const first = extractSlices(ROADMAP, { width: detectWidths(ROADMAP) });
	const one = first.docs[0];
	const id = frontmatter.read(one.content).data.id;
	const held = `${id}_AUTHORED_BY_A_HUMAN.md`;

	const guarded = extractSlices(ROADMAP, {
		width: detectWidths(ROADMAP),
		existing: new Map([[id, held]]),
	});

	assert.ok(!guarded.docs.some((d) => frontmatter.read(d.content).data.id === id),
		'the authored id must not be regenerated');
	assert.deepStrictEqual(guarded.kept, [id], 'and it is REPORTED as kept, not silently skipped');
	assert.strictEqual(guarded.docs.length, first.docs.length - 1, 'every other row still emits');
	assert.ok(guarded.text.includes(held),
		'the register points at the authored filename, not a freshly derived one');
	assert.ok(!guarded.text.includes(one.file),
		'and never at a name derived from the row it replaced');
});

test('[slices] every emitted document declares exactly ONE id, in frontmatter', () => {
	// The whole design rests on this. A document carrying two ids has no single `id:` to declare,
	// and the Delivery Index could not be regenerated from it.
	const r = extractSlices(ROADMAP);
	for (const d of r.docs) {
		const { data } = frontmatter.read(d.content);
		assert.ok(data.id, `${d.file} declares no id`);
		assert.deepStrictEqual(d.ids, [data.id]);
	}
});

test('[slices] a document CARRIES the reference definitions it uses', () => {
	// A roadmap keeps its reference definitions in one block at the bottom. Moving a cell into a
	// slice document moved the usage and left the definition behind, so every generated document
	// linking to a design doc had a dead reference - `links` found nine the moment the preview was
	// regenerated, and they would have followed the documents into docs/project/slices/ on adoption.
	//
	// This is pinned here rather than left to CI over the generated folder, because that folder is
	// gitignored and excluded: the signal has to live somewhere permanent.
	const src = [
		'## Delivery Index',
		'',
		'| ID | State | Slice | Doc |',
		'| --- | --- | --- | --- |',
		'| VS-1 | planned | one | [The design][d] |',
		'| VS-2 | planned | two | none |',
		'',
		'[d]: ../design/thing.md',
	].join('\n');
	const r = extractSlices(src, { width: 0 });
	const one = r.docs.find((d) => d.ids[0] === 'VS-1');
	const two = r.docs.find((d) => d.ids[0] === 'VS-2');

	// A slice document sits one directory deeper than the roadmap, so a relative target needs one
	// more `../` to still mean the same file.
	assert.ok(one.content.includes('[d]: ../../design/thing.md'),
		'the definition must travel with the usage, re-pointed for the extra directory');

	// Only what is used. Copying every definition into every document would have `links` reporting
	// the unused ones instead.
	assert.ok(!two.content.includes('[d]:'), 'a document that cites nothing carries nothing');
});

test('[index] a MIGRATED register is stable, and the narrative it moved is not lost', () => {
	// The round trip, end to end: roadmap -> slice documents -> roadmap. Read back off the
	// GENERATED text rather than the in-memory objects, so the serialise/parse leg is exercised
	// instead of skipped.
	//
	// THIS USED TO ASSERT `res.text === ROADMAP` - that a freshly migrated register regenerates its
	// ORIGINAL rows byte for byte - and that is the one thing it must not do. Byte-for-byte identity
	// here means the narrative cell is still DECLARED in frontmatter, so `index --write`, the step
	// documented to follow a migration, writes every paragraph straight back into the register the
	// migration just emptied. Measured on this repo (DT-53): longest row 341 chars after migrating,
	// 5961 after re-indexing. The invariant was encoding the defect as a requirement.
	//
	// Migration is a deliberate, one-time relocation: the narrative leaves the cell and lands in the
	// document body. So what must hold is IDEMPOTENCE FROM THE SECOND PASS, plus losslessness.
	const first = extractSlices(ROADMAP, { width: detectWidths(ROADMAP) });
	const recs1 = first.docs.map((d) => frontmatter.read(d.content).data);
	const once = renderIndex(ROADMAP, recs1).text;

	const second = extractSlices(once, { width: detectWidths(once) });
	const recs2 = second.docs.map((d) => frontmatter.read(d.content).data);
	const twice = renderIndex(once, recs2).text;

	assert.strictEqual(twice, once,
		'an already-migrated register must regenerate to itself, byte for byte');

	// Losslessness: the paragraph is RELOCATED, never dropped. Checked on a specific cell rather
	// than a count, so a regression that empties the body as well as the row cannot pass.
	const moved = 'Added 2026-08-08. Wilson said so.';
	const bodies = first.docs.map((d) => frontmatter.read(d.content).body).join('\n');
	assert.ok(ROADMAP.includes(moved), 'fixture still carries the narrative cell this test tracks');
	assert.ok(bodies.includes(moved), 'the narrative moved into a document body');
	assert.ok(!once.includes(moved), 'and it no longer sits in the register row');
});

test('[index] rows keep the position their AUTHOR gave them', () => {
	// Sorting by prefix then number looked canonical and was wrong: DevTools lists DT-030 before
	// DT-029, and this repo lists DT-36 above DT-26. Those orders are decisions - rows get grouped
	// and moved next to what they relate to - and reshuffling them produced a 555-row diff on
	// SX_Coder that said nothing at all.
	const src = HDC_SHAPE.replace('| HDC-1 | the burster', '| HDC-9 | the burster');
	const r = extractSlices(src, { width: 0 });
	const records = r.docs.map((d) => frontmatter.read(d.content).data);
	const rows = renderIndex(src, records).text.split('\n')
		.filter((l) => /^\| HDC-/.test(l)).map((l) => l.split('|')[1].trim());
	assert.deepStrictEqual(rows, ['HDC-9', 'HDC-13'], 'HDC-9 stays above HDC-13 because it was');
});

test('[index] a row with more cells than columns is REFUSED, not repaired', () => {
	// `tables` already refuses this: given one pipe too many, no tool can tell a literal pipe from
	// a forgotten column. The renderer was quietly escaping them, which is the same guess made
	// silently - five rows across the estate would have shipped with invented escaping.
	const src = HDC_SHAPE.replace('| HDC-1 | the burster | **done** | See Slice Notes. |',
		'| HDC-1 | the burster | **done** | a | b | c |');
	const r = extractSlices(src, { width: 0 });
	const records = r.docs.map((d) => frontmatter.read(d.content).data);
	const res = renderIndex(src, records);
	assert.deepStrictEqual(res.malformed, ['HDC-1']);
	assert.ok(res.text.includes('| HDC-1 | the burster | **done** | a | b | c |'),
		'the row is copied through byte-for-byte, not rewritten');
});

test('[index] a document claiming an unminted id is reported, never added', () => {
	// Minting is a human act in a planning surface. A generator that can mint is a generator that
	// can mint by accident.
	const r = extractSlices(HDC_SHAPE, { width: 0 });
	const records = r.docs.map((d) => frontmatter.read(d.content).data);
	records.push({ id: 'HDC-99', state: 'planned', title: 'never minted' });
	const res = renderIndex(HDC_SHAPE, records);
	assert.deepStrictEqual(res.unknown, ['HDC-99']);
	assert.ok(!res.text.includes('HDC-99'), 'and it must not appear in the table');
});

test('[index] padding is a convention of a PREFIX, not of a file', () => {
	// SX_Coder's own ids are two digits wide and its index also carries DW-024 and DW-025, which
	// SX_DW pads to three. One width for the whole file renamed those two rows on every run.
	const mixed = [
		'## Delivery Index',
		'',
		'| ID | State | Slice |',
		'| --- | --- | --- |',
		'| VS-01 | planned | one |',
		'| VS-100 | planned | two |',
		'| DW-024 | planned | three |',
	].join('\n');
	assert.deepStrictEqual(detectWidths(mixed), { VS: 2, DW: 3 });

	// And the shortest id states the convention: requiring one uniform length read SX_Coder - 217
	// two-digit ids and 349 three-digit - as unpadded, and would have renamed all 217.
	const r = extractSlices(mixed, { width: detectWidths(mixed) });
	const records = r.docs.map((d) => frontmatter.read(d.content).data);
	assert.deepStrictEqual(records.map((x) => x.id), ['VS-01', 'VS-100', 'DW-024']);
});

test('[index] alignment is read off the SEPARATOR row', () => {
	// `format` leaves tables alone by design, so alignment is this renderer to keep. Asking
	// whether cells had surrounding whitespace did not work - rowCells returns them WITH their
	// padding, so every table looked aligned and DevTools reflowed all 82 rows.
	const aligned = [
		'## Delivery Index',
		'',
		'| ID     | State   | Slice        |',
		'| ------ | ------- | ------------ |',
		'| VS-001 | planned | one          |',
	].join('\n');
	const r = extractSlices(aligned, { width: detectWidths(aligned) });
	const records = r.docs.map((d) => frontmatter.read(d.content).data);
	assert.strictEqual(renderIndex(aligned, records).text, aligned,
		'an aligned register must come back aligned, to the widths its separator declares');
});

test('[index] detectWidth still answers for a single-series register', () => {
	const one = ['## Delivery Index', '', '| ID | State | Slice |', '| --- | --- | --- |',
		'| DT-000 | planned | x |', '| DT-082 | planned | y |'].join('\n');
	assert.strictEqual(detectWidth(one), 3);
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
