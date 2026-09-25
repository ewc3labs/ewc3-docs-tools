# AGENTS.md — ewc3-docs-tools

> **This file adds to `ewc3labs-hq/AGENTS.md`; it never weakens it.** The HQ baseline carries the
> identity, tone, method and engineering discipline for every EWC3 Labs repo. Repeat none of it here.
> Write only what an agent would get **wrong** in this repository without being told.
>
> Precedence: platform instructions → HQ baseline → this file → `copilot-instructions.md`.

---

## Read this first

- **[`docs/For_Agents.md`](docs/For_Agents.md)** — the failure modes that are specifically yours:
  where a marker may sit, why an archive is never reformatted, and why a check that passes may be
  checking nothing.
- **[`docs/design/one-template-beats-three-parsers.md`][docs-design-one]** — settles the question
  this repository keeps re-opening: when a document does not match the shape, the answer is to
  **refuse and name the line**, not to teach the parser another shape.
- **[`docs/design/the-slice-document-is-the-object.md`][docs-design-the]** — the slice document is
  authored; the roadmap table is a **projection** of it. Nobody edits a row.
- **[`docs/Reference.md`](docs/Reference.md)** — every command, flag, what each writes, and its exit
  codes. It is the surface contract, and tests assert that it documents every flag the CLI reads.

## What this actually is

A CLI (`ewc3-docs`) that keeps planning documents honest **in other people's repositories**: it
formats markdown, derives numbers into marked spans, checks links, owns ID series, projects a
Delivery Index from slice documents, folds git trailers into slice state, mints slices, and migrates
a legacy planning surface into the current shape. It is pointed at a repository and **writes files
there**.

It is not a static-site generator, not a prose linter, and not a project-management system. It
derives what can be derived and refuses what it cannot check.

## The constraint that bites

**A tool that reports a state it did not reach is the defect this repository exists to prevent.**
Every rule below is a day already spent:

- **The exit contract is load-bearing: `0` consistent · `1` diverged, and it names an id or a file ·
  `2` did not run.** A crash is `2`, never `1` — Node exits 1 on an uncaught exception, which read
  as "the documents are wrong", and a harness asserting "a diverged fixture exits 1" counted crashes
  as passes. `bin/ewc3-docs.js` installs a top-level handler for exactly this.
- **A passing check may be checking nothing.** A glob bug matched only the top level, so a
  repository checked 15 of 39 documents and was told everything passed. When a result looks clean,
  **count the files**.
- **Ids are padding-insensitive.** `VS-4`, `VS-004` and `VS-00004` are one slice. Compare through
  `normalizeId`; never by string.
- **A region that does not render must not declare.** Fenced code, indented fences, and HTML
  comments are documentation: a table row, a legend or an id inside one mints nothing and declares
  nothing. `withoutFences` in `lib/series.js` is the one implementation — reach for it rather than
  writing a second.
- **Registers come in more than one shape.** The header may say `Prefix` or `Series`; a register may
  be canonical, legacy, or absent; a legend may be missing, partial or unreadable. Accept the shapes
  that are real, and **refuse the rest by name and line** rather than guessing. A six-round attempt
  at a reference resolver ended by deleting the parser.
- **Cross-repository links are never resolved — they are twin-checked.** A link that leaves the
  repository must have a matching GitHub twin. Do not "fix" it by resolving it locally.

## Architecture, in the amount an agent needs to not break it

- **`lib/` decides; `bin/ewc3-docs.js` reports.** Library code returns findings —
  `{ ok, problems, … }` — and does not print or exit. Argument parsing, human output and exit codes
  live in the CLI.
- **One grammar, one owner.** `lib/slices.js` owns the id grammar (`idPattern`, `normalizeId`), cell
  splitting and link rebasing; `lib/series.js` owns fences and declaring positions; `lib/fold.js`
  owns trailers and the legend; `lib/deliveryindex.js` renders rows. When two modules need the same
  rule, **move the rule**, do not copy it.
- **`fold` writes slice frontmatter only.** Never `STATUS.yaml`, never anything cross-repository.
  That boundary was agreed with the consumers and is not ours to move.
- **Writes go through the index gate.** A row edited by hand is refused, not overwritten, and a
  refusal rolls back anything already written — all or nothing.
- **Git is read through plumbing**, in `lib/gitbase.js` and the local helpers beside it. Never test
  for `.git` as a directory: in a linked worktree it is a file, which is exactly how this repo is
  developed.

## Scope, and what is deliberately out

In scope: the commands in `docs/Reference.md`, the slices in `docs/project/`, and whatever a
downstream conversion measurably needs.

Deliberately out:

- rendering, publishing or site generation;
- judging **content** — "mentioned in STATUS" is evidence, never a verdict that work is done;
- writing another repository's status or roll-up files;
- rewriting history to fix a wrong pointer: a correct pointer somewhere readable is the fix;
- teaching a parser a fourth shape when a refusal would do.

## Repo standards

- **Language and toolchain** — Node, no dependencies, CommonJS. `npm test` runs `node test/run.js`;
  `npm run verify` is check-then-test. There is no build.
- **Layout** — `bin/` the CLI · `lib/` the modules · `test/run.js` the whole suite · `docs/design/`
  why · `docs/project/` roadmap and slices · `USAGE.txt` the help text.
- **Tests** — one file, plain `node:assert`, no framework. **Every fix starts with a failing test**,
  and the commit says it failed. Green means `N passing, 0 failing` plus `check`, `index --check`
  and `fold --check` all exiting 0 here.
- **Assert the value, not that something is there.** A count, a `size`, a `has(word)` — each passes
  over a value that survived *incorrectly*. A legend read that kept a state and stored its spelling
  as `🗃️ _ retired` passed every count-based check, and `fold` would have written that into every
  row: consistent with itself at every surface, so nothing disagreed with anything.
- **A sanitiser is tested against a legal value that resembles what it strips.** Stripping emphasis
  from a glyph was tested against glyphs that needed stripping and passed; the case that broke it
  was a keycap — `*️⃣` **is** an asterisk — which no register had yet used. Test the property that
  could break it, not the property that motivated it.
- **A design note states intent; only the code knows what it does.** A module header here says one
  document per narrative *group*; the extractor emits one per **row**. Reading the note and relaying
  it as behaviour sent a downstream lane to withdraw a correct check. Before you state what this
  tool does — especially to someone who will act on it — **run it against a fixture**.
- **A check written from a failure enforces the failure, not the contract.** Derive a check from
  what must be true, then confirm it passes on correct data. A downstream check written from the
  shape of one defect would have gone red on every register that groups its narrative.
- **A count whose source is unnamed is not a check.** "Documents emitted equals rows" is two
  different checks: over the printed line it false-alarms on any repository with kept documents,
  over the staged tree it holds. Name where the number comes from, or it is not a gate.
- **CI** — tests on Node 18, 20, 22 and 24, plus "Check our own docs", which runs this tool against
  this repository. If the toolkit cannot keep its own documentation honest, it is not ready to be
  pointed at anyone else's.
- **Dogfood before you commit** — `node bin/ewc3-docs.js fix`, then `check`, `index --check`,
  `fold --check`. Commits that advance a slice carry `Slice:`/`State:` trailers; validate the
  message first with `fold --check-message <file> --staged`.
- **Public repo.** No organisation or repository names from downstream estates, no local paths, no
  internal object or marker filenames, and no downstream measurements — in code, tests, fixtures,
  documentation, commit messages, PR bodies or PR comments. **Keep the lesson, drop the name**: a
  finding becomes "a downstream pilot measured…" with the shape intact.

## Files this repo does NOT commit

Tooling writes into working trees. **Decide per file by what reads it:**

| File | Read by | Verdict |
| --- | --- | --- |
| `AGENTS.md`, `.github/copilot-instructions.md` | every clone, and GitHub | **tracked** — authored, reviewed, useful to others |
| `CLAUDE.md`, `.codex/`, `.cavemanrc` | one machine's tooling, rewritten on open | **ignored** — machine-local, not repo canon |
| `.aicache/`, `.codegraph/` | one machine's caches and indexes | **ignored** |
| `.vscode/settings.json` | this editor, on this machine | **ignored** — the AI extension writes absolute user paths into it, and this repository is public. Shared editor settings belong in the multi-root `.code-workspace` |

## Conventions inherited from the org

- `docs/analysis/` evidence · `docs/design/` architecture and why · `docs/RAG_Sessions/` how a hard
  problem was actually solved · `docs/project/` roadmap, punchlist and slices.
- Roadmap states, ID prefixes and the thin-table rule: load the `ewc3labs-project-roadmap` skill.
- Branching, review and merge policy:
  `ewc3labs-hq/docs/project_development/Branch_And_Review_Discipline.md`. Here that means: **one
  branch at a time**, a pull request per slice, **merge commits** (never squash — it destroys the
  ancestry that proves other branches are contained), and main's history is never rewritten.
- LF everywhere, enforced by `.gitattributes` and `.editorconfig` from `ewc3labs-hq/templates/`.

## When in doubt

- **Mint a slice, do not widen one.** `ewc3-docs slice new DOCS "<title>" --set est=S --write`, then
  write the problem with its measurement in the document. The slice document is the object; the
  roadmap row follows by itself.
- **A review finding blocks a merge only when normal use can silently destroy something a person
  wrote.** Loud failures, coverage gaps and contrived inputs are recorded in `DOCS-064` with a fix
  sketch, answered on the thread, and merged past. Rounds stop converging long before findings stop
  arriving.
- **When a finding class keeps recurring, stop parsing rather than parse harder.**
- The question to ask of anything you are about to write into a document: **what would make this
  wrong, and would anything notice?** If nothing would notice, it wants a marker, a check, or
  deleting.

[docs-design-one]: docs/design/one-template-beats-three-parsers.md
[docs-design-the]: docs/design/the-slice-document-is-the-object.md
