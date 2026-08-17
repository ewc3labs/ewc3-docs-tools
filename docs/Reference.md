# Reference

Every command, flag, config field, and resolver. If something the tool does is not on this page,
that is a bug — there is a test asserting this page covers the code's surface.

## Commands

| | writes | what it does |
| --- | --- | --- |
| `format [--check] [files...]` | yes | Wraps prose so a source line is as wide as it renders. Moves long URLs to reference definitions. **Never changes a word.** |
| `values [--check]` | yes | Refreshes numbers written between `<!--ewc3:name-->` markers. |
| `links` | never | Dead links, wrong-case links, undefined references, orphaned documents. |
| `series` | never | Who owns which ID prefix, and the last number used. |
| `fix` | yes | `values` then `format`, in write mode. **The pre-commit button.** |
| `check` | never | All four in check mode. **The CI command.** |

`fix` and `check` are mirrors of each other: one makes it right, one asks whether it is.

**Order matters inside `fix`.** Values run first, because substituting a number changes the line and
the wrap has to see the result. Running `format` then `values` can leave a line over width.

### Flags

| | |
| --- | --- |
| `--check` | Report what would change and exit non-zero. Writes nothing. `format` and `values` only. |
| `--config <path>` | Use this config instead of searching. |
| `[files...]` | Positional globs override `include` for this run. `format` and `values` only. |

### Exit codes

| | |
| --- | --- |
| `0` | clean |
| `1` | something is wrong with the documents |
| `2` | something is wrong with the invocation — bad config, unknown command, missing file |

The split matters in CI: `1` means fix your docs, `2` means fix your setup.

## Configuration

`.ewc3-docs.json` in the repository root, or `config/ewc3-docs.json`, or `--config <path>`. **Two
config files is an error**, not a preference — one being silently ignored looks exactly like the
config not working. Paths inside are relative to the **repository**, never to the config file.

Every field is optional, and a repository should only say what is genuinely different about it.
Declaring a default back to the tool reads, later, as deliberate divergence.

```json
{
  "include": ["README.md", "docs/**.md"],
  "exclude": ["docs/archive/**.md"],
  "format": { "width": 100, "urlMin": 26, "labelMax": 20 },
  "links": { "orphanRoot": "docs", "skipDirs": ["node_modules", ".git", "archive"] },
  "series": { "roadmaps": ["docs/project/*Roadmap.md"] },
  "values": { "tests": { "countMatches": { "files": ["test/*.js"], "pattern": "^\\s*test\\(" } } }
}
```

| field | default | |
| --- | --- | --- |
| `include` | `["README.md", "docs/**.md"]` | what `format` and `values` act on |
| `exclude` | `[]` | removed from `include`; this is where `archive/` goes |
| `format.width` | `100` | wrap column |
| `format.urlMin` | `26` | shorter URLs stay inline, because they do not distort the line |
| `format.labelMax` | `20` | a long reference label distorts the line just as the URL did |
| `links.orphanRoot` | `"docs"` | directory whose documents must all be reachable |
| `links.skipDirs` | see below | directory **names** never descended into, at any depth |
| `series.roadmaps` | `["docs/project/*Roadmap.md", "docs/project/*ROADMAP.md"]` | where roadmaps live |
| `values` | `{}` | see [Resolvers](#resolvers) |

Default `skipDirs`: `node_modules`, `.git`, `dist`, `out`, `.vscode-test`, `archive`, `coverage`.

**`archive` is skipped by default and should stay skipped.** Reformatting an archive rewrites the
past.

## Globs

Deliberately minimal: a literal path, `dir/*.md`, or `**` at any depth.

| | |
| --- | --- |
| `docs/*.md` | markdown directly in `docs/` |
| `docs/**.md` | markdown in `docs/` **at any depth** |
| `docs/**/*.md` | the same thing; both spellings work |

Directories starting with `.` and `node_modules` are never walked.

> **`docs/**.md` once silently matched only the top level.** A consumer was checking 15 of 39
> documents and being told everything passed. A checker that quietly checks less than you think is
> worse than no checker — which is why the glob has its own tests now.

## Markers

```md
Quality gates: ESLint, TypeScript, <!--ewc3:tests-->136<!--/ewc3:tests--> tests
```

HTML comments, **not braces** — braces are JSON, and JSON appears in documentation constantly.

**A marker inside a code span or fenced block is documentation about the syntax, not a marker.** It
is left alone, so a project can explain the convention and still pass its own check.

Rules that will bite you are in [For agents][for-agents] — they apply to humans equally, agents just
hit them faster.

## Resolvers

Each entry under `values` names exactly one resolver.

| | shape | |
| --- | --- | --- |
| `literal` | `{ "value": "0.6.0" }` | a constant, for something not yet derivable |
| `template` | `{ "text": "tests-${tests}-brightgreen" }` | builds a string from other values |
| `fromJson` | `{ "file": "package.json", "path": "version" }` | reads a dotted path |
| `countJson` | `{ "file": "package.json", "path": "contributes.commands" }` | counts a collection |
| `countMatches` | `{ "files": ["test/*.js"], "pattern": "^\\s*test\\(", "flags": "gm" }` | counts regex matches across files |
| `maxMatch` | `{ "files": ["docs/**.md"], "pattern": "PQ-(\\d+)", "flags": "gm" }` | the **highest** captured number |
| `lastId` | `{ "prefix": "PQ", "files": [...] }` | the highest ID for a prefix; `files` defaults to the roadmaps |

`flags` defaults to `gm`.

**`maxMatch` and `lastId` take the maximum, not a count.** Counting rows agrees with the highest ID
only while a series is contiguous, and a series stops being contiguous the first time something is
dropped. A count then hands out a number that is already taken.

**Templates resolve last**, so a template may name any non-template value. A template naming an
undeclared value fails loudly rather than emitting `${undefined}`.

**A value with no JSON to read.** `fromJson` reads JSON, not TOML or YAML — see the [Python
section](Adopting.md#python-repositories) for what to do instead.

## What each check catches

| | |
| --- | --- |
| `format` | a source line much wider or narrower than it renders, so diffs are unreadable |
| `links` | dead links, **wrong-case** links, undefined `[text][label]`, unreachable documents |
| `values` | a number in prose that no longer matches what it counts |
| `series` | an ID prefix no roadmap declares, or one global prefix claimed twice |

**The wrong-case check earns its place.** `USER_GUIDE.md` when the file is `User_Guide.md` resolves
on Windows and macOS and fails on GitHub — so it works on every machine that could catch it and
breaks for every reader.

## Adding a check

The bar is that **it has already gone wrong somewhere, quietly.** Every check here exists because of
a specific failure, not a style preference. A check that fires on something nobody was getting wrong
is noise, and noise is how a green build stops meaning anything.

[for-agents]: For_Agents.md#things-you-will-get-wrong
