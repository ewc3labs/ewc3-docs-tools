<!-- HEADER_TABLE -->
<table align="center">
<tr>
  <td width="112" align="center" valign="middle">
    <img src="assets/EWC3LabsLogo-blue-128x128.png" width="128" height="128"><br>
    <strong><em>QA Officer</em></strong>
  </td>

  <td align="center" valign="middle">
    <h1 align="center">ewc3-docs-tools</h1>
    <p align="left">
      <b>Keep your documentation honest without hiring anyone to read it.</b><br>
      <sub>
        Prose that wraps properly, links that resolve, and numbers that come from the thing they
        describe. Built by <strong>EWC3 Labs</strong>.
      </sub>
    </p>
  </td>
</tr>
</table>
<!-- /HEADER_TABLE -->

<!-- BADGES -->
<p align="center">
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg">
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg">
  <img alt="Dependencies" src="https://img.shields.io/badge/dependencies-none-brightgreen.svg">
</p>
<!-- /BADGES -->

---

These are the tools we use in the labs. They are public because you may want them too.

**The problem is not that people are careless with documentation.** It is that documentation is one
of the most important parts of a project and almost always the least maintained, and nothing about
it fails loudly. A broken build stops you. A doc that says `63 tests passing` when there are 111, or
links to a file deleted a year ago, keeps rendering perfectly - nothing is red, nothing is blocked,
and the only signal is a reader who trusts it and is wrong.

The usual fix is a fleet of technical writers reading every word on every change. Ain't nobody got
time for that. So the actual fix is to make the parts that rot **derive from the thing they
describe** and let CI notice, which is a much smaller job than it sounds.

The look is shamelessly stolen from [Klipper][klipper] - flat files, one document per feature, and
references that enumerate everything - with far less handrolling. Thanks, Klipper community.

## What is in here

- **format** - wrap prose so a source line is as wide as it renders
- **links** - dead links, wrong case, undefined references, and unreachable documents
- **values** - numbers in prose that come from the thing they describe

Node 18+, no dependencies. Every one of them exists because of a specific failure, not a style
preference, and each section below says which.

## Install

```bash
npm install --save-dev github:ewc3labs/ewc3-docs-tools
```

Then add to `package.json`:

```json
{
  "scripts": {
    "docs:format": "ewc3-docs format",
    "docs:links": "ewc3-docs links",
    "docs:values": "ewc3-docs values",
    "docs:check": "ewc3-docs check"
  }
}
```

`ewc3-docs check` runs all three in check mode and is the one CI should call.

## format

An inline `[Klipper][klipper]` costs 45 source columns and renders as 7. Wrapping at a fixed width
therefore produces lines that end nowhere near where the text ends, and reading it feels like the
font changed mid-paragraph — every visual cue says the line is full, and the words say otherwise.

Long URLs move into reference definitions at the foot of the file, leaving `[text][label]` in the
prose. Short relative links stay inline, where seeing the target is worth the columns it costs.

**It never changes a word.** That is asserted directly in the tests by comparing word streams before
and after, because it is the only property that would matter if it were wrong.

Code fences, tables, headings, blockquotes and raw HTML are passed through untouched. Formatting is
idempotent, and labels are stable across runs.

## links

Four failures, all silent:

| | |
| --- | --- |
| **does not exist** | the ordinary broken link |
| **wrong case** | `USER_GUIDE.md` when the file is `User_Guide.md`. Windows and macOS resolve it happily; GitHub and Linux do not — so it works on every machine that could catch it, and breaks for every reader |
| **undefined reference** | `[text][typo]` with no definition renders as literal brackets, forever |
| **orphan** | a document nothing links to. It stays correct and unread until it goes stale |

A link to a *directory* makes everything under it reachable, so an index can point at `design/`
without listing every file in it.

## values

The marker is an HTML comment, and the current value lives between the markers:

```markdown
Quality gates: ESLint, TypeScript, <!--ewc3:tests-->111<!--/ewc3:tests--> tests
```

**Why not `{tests}`?** Because our documentation is full of JSON, JSONC settings blocks and template
literals. A placeholder that collides with real content in the same file is a find-and-replace
accident waiting to happen.

HTML comments cannot collide. They are legal anywhere in markdown, invisible when rendered, and —
the part that matters — **the current value stays visible between them**. A reader with no tooling
installed sees `111 tests`, not a broken placeholder. Someone reading the source sees both the value
and where it comes from.

The same marker works around a whole block, which is how badges are handled: a URL cannot contain an
HTML comment, so the markers go around the line and a `template` rebuilds it.

**Inside an HTML block, keep the markers inline.** A badge row is usually a `<p align="center">`
full of `<img>` tags, and putting the open marker on its own line inside it ends the HTML block for
some renderers - GitHub renders it correctly and a local preview does not, which is a confusing way
to find out. Put the whole row on one line with the markers inline around each value, and separate
the badges with `&nbsp;` so the row is not broken across lines:

```html
<p align="center">
<img alt="License" src="..."><!--ewc3:badgeVersion--><img alt="Version" src="..."><!--/ewc3:badgeVersion-->
</p>
```

`format` leaves that line alone, because it begins with `<`.

### Resolvers

| Resolver | Takes |
| --- | --- |
| `fromJson` | `{file, path}` — a dotted path into a JSON file |
| `countJson` | `{file, path}` — the size of an array or object |
| `countMatches` | `{files, pattern}` — regex matches across files |
| `maxMatch` | `{files, pattern}` — the HIGHEST number captured, for allocating the next ID in a series |
| `template` | `{text}` — interpolates other values with `${name}` |
| `literal` | `{value}` — for things with no better source yet |

`countMatches` counts what is **declared**, which is not always what a runner reports — a
conditionally skipped test is declared but pending. Name the value for what it counts (`tests`, not
`testsPassing`) and the number stays true.

`maxMatch` is for the "last number used" cell in a roadmap or ID registry, and it is **max rather
than count on purpose**. Counting rows gives the right answer only while a series is contiguous, and
starts handing out already-taken IDs the moment one is retired — a wrong number that looks derived
is worse than an obviously stale one. Compose it with `template` to format:

```json
"lastNum": { "maxMatch": { "files": ["ROADMAP.md"], "pattern": "^\| PQ-(\d+)" } },
"lastId":  { "template": { "text": "PQ-${lastNum}" } }
```

## Configuration

**Most repositories need no configuration at all.** Every field has a working default, and this
repository is its own example - it has no `.ewc3-docs.json`, and `ewc3-docs check` behaves
identically with or without one.

| Default | |
| --- | --- |
| `include` | `["README.md", "docs/**.md"]` |
| `exclude` | nothing |
| `format.width` | `100` |
| `links.orphanRoot` | `docs` |
| `values` | none |

Add `.ewc3-docs.json` to the repository root to say what is genuinely different. In practice that
means `values`, which cannot be guessed, and sometimes `include`.

**`include` replaces the default rather than adding to it**, so a repository that also documents
`SUPPORT.md` lists all three:

```json
{
  "include": ["README.md", "SUPPORT.md", "docs/**.md"],
  "exclude": ["docs/Config_Reference.md"],
  "values": {
    "tests": { "countMatches": { "files": ["test/*.ts"], "pattern": "^\\s*(test|it)\\(" } },
    "version": { "fromJson": { "file": "package.json", "path": "version" } }
  }
}
```

**Exclude generated files.** If a document is produced by a generator and checked byte-for-byte,
formatting it afterwards will make the two disagree.

**Do not declare a default back.** `"format": {"width": 100}` does nothing except make a later
reader wonder which repository has a different width, and why.

Anything in the toolkit that ends up identical in every repository is a sign the default is wrong -
fix it here rather than copying it there.

## What lives here, and when

This repository is where EWC3 Labs documentation tooling **graduates to**.

The rule: **the moment two repositories are doing the same shape of thing, the tool comes out of the
product repo and moves here.** Not before - a tool with one caller is just a script, and
generalizing it early means guessing at the second caller instead of reading it. But not later
either, because the second copy is where the two quietly diverge and you end up maintaining both.

Every one of these arrived that way. `format` and `links` were written inside
[excel-power-query-editor][excel-power-query] to fix its own docs, and moved here the moment it was
clear [ewc3-recall-tape][ewc3-recall-tape] needed exactly the same thing. `values` was written here
directly, because by then the pattern was obvious.

What stays behind: anything that knows about the product. A generator that reads a VS Code extension
manifest belongs in the extension, not here. The test is whether a second repository could use it
without explaining itself.

## Tests

```bash
npm test
```

No framework. `node test/run.js`.

## License

MIT.

[ewc3-recall-tape]: https://github.com/ewc3labs/ewc3-recall-tape
[ewc3labs]: https://github.com/ewc3labs
[excel-power-query]: https://github.com/ewc3labs/excel-power-query-editor
[klipper]: https://github.com/Klipper3d/klipper
