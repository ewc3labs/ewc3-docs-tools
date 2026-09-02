# ewc3-docs-tools — Development Roadmap

## Current Focus

The toolkit is in use by [excel-power-query-editor][epqe] and [ewc3-recall-tape][recall-tape], and
CI-enforced in both. Five checks are live: `format`, `links`, `values`, `series` and `tables`.

`series` is now being dogfooded against a second, much messier estate — eleven MedAR repositories
with three different register shapes, roadmaps nested one directory deeper than the default glob,
and backlogs that mint IDs as numbered lists. Most of `DT-18`..`DT-28` came from that, and every one
of them was a silent pass before it was a finding.

What is next is driven by the first Python consumer. The Music Forensics Workbench will be Python,
and `fromJson` cannot read `pyproject.toml` — so `DT-1` stops being theoretical the moment that repo
gets a README.

## ID Prefixes

**Read this before minting an ID.** It sits above the tables because it is an input to writing one,
not a summary of them.

| Prefix | Scope | Owner | Last Used | Series |
| --- | --- | --- | --- | --- |
| DT | global | ewc3-docs-tools | <!--ewc3:lastDT-->DT-40<!--/ewc3:lastDT--> | toolkit features and fixes |
| FIX | repo-local | ewc3-docs-tools | <!--ewc3:lastFIX-->FIX-1<!--/ewc3:lastFIX--> | small corrections not worth a slice |

**Last Used is derived** from the tables below by `ewc3-docs values`, and CI fails if it is stale.
**Max, not a count** — counting rows agrees with the highest ID only while a series is contiguous.

**A global prefix belongs to exactly one roadmap.** Two layers enforce that, and only one of them is
mechanical: `series` sees only the roadmaps beneath the repository it runs in, so it catches two
roadmaps in *this* repo claiming the same prefix and cannot know another repository claimed it too.
Uniqueness across EWC3 Labs rests on the [prefix registry][prefix-registry], which is a convention,
not a check. **`FIX` is repo-local and that is canon** — every roadmap owns its own, because a fix
is never referenced from outside the repository it fixes.

## Delivery Index

**Rows are one line.** Anything wanting a paragraph wants a slice document.

| ID | State | Slice | Est | Doc | Status |
| --- | --- | --- | --- | --- | --- |
| DT-1 | ⬜ planned | Read values from TOML, for Python repos | S | — | `fromJson` cannot read `pyproject.toml`; the workaround is writing JSON from a build step, which is not always available |
| DT-2 | ⬜ planned | `format --check` should say WHAT would change | S | — | it names the file and not the reason, so the fix is "run the tool and read the diff" |
| DT-3 | ⬜ planned | Publish to npm rather than installing from git | M | — | `github:` specs work but pin nothing; a version number would let consumers upgrade deliberately |
| DT-4 | ⬜ planned | Anchor checking for `[text](file.md#heading)` | M | — | the file is verified, the heading is not, so a renamed heading breaks silently |
| DT-15 | ⬜ planned | `next <PREFIX>`: print the next free ID | S | — | **not yet earned.** Derived Last Used already removed the state that could go stale; only the `+1` is manual. Build it when an agent demonstrably gets the `+1` wrong, not before |
| DT-16 | ⬜ planned | Org-level series check across every roadmap | M | — | `series` sees only its own repository, so cross-repo uniqueness rests on the HQ registry by convention. An HQ job could scan all roadmaps and validate it mechanically |
| DT-21 | ⬜ planned | Widen the docs-surface test past `Reference.md` | S | — | it asserts every command is in the reference and nothing more, so `tables` shipped absent from the README, the agent guide and this roadmap while the test stayed green |
| DT-22 | ⬜ planned | A derived marker for what is built | M | — | `Overview.md` claimed "nothing built" of two partly-built proposals; a prose claim about build state is the exact class this toolkit says to derive |
| DT-23 | ⬜ planned | Cross-repo collision check: a mention is not a mint | M | — | an ID is minted where it appears in a **declaring** position and merely cited everywhere else; three false positives in one night came from a survey doc and a skill example that quote IDs while describing them, and a slice-document burst multiplies citations per repo by a hundredfold. `DT-24` built the position list this stands on |
| DT-30 | ⬜ planned | Report an ID declared TWICE inside one repository | S | — | `declaredIds` keys by prefix and number and keeps the first hit, so a second declaration of the same ID is silently discarded; measured on SX_DW, where 10 IDs are declared in both the roadmap and the backlog and the reconcile still reported a clean repo |
| DT-31 | ⬜ planned | Report a backlog that DECLARES an ID rather than citing one | S | — | a backlog item is intake, not a commitment, so a minted ID in its leading position is a convention violation; today it is silently legal because the backlog inherits its roadmap's ownership table — measured on SX_DW (4 squatters) and MedAR_AI_Runtime (4 that hid cross-repo collisions) |
| DT-36 | ⬜ planned | old: git trailers become frontmatter state, idempotently | L | [One thing to edit][one-thing-to-edit] | Slice:/State: ride the commit that did the work so they cannot drift from it; newest wins, and state_source: human is never overwritten |
| DT-37 | ⬜ planned | Emit the Delivery Index into a marked region of the roadmap | M | [One thing to edit][one-thing-to-edit] | every column derives from frontmatter, so the table becomes a view; a hand edit inside the markers must FAIL rather than be silently regenerated away |
| DT-38 | ⬜ planned | Refuse a Slice: trailer naming an ID with no slice document | S | [One thing to edit][one-thing-to-edit] | measured: a commit tagged [VS-24] for VS-08 work was caught only because a human noticed, and a wrong pointer fails louder than a missing one |
| DT-35 | ⬜ planned | Frontmatter is the ONLY declaring position in a slice or module doc | L | [Frontmatter is the declaration][frontmatter-is-the] | replaces the heading, list and arbiter rules with one delimited block, each of which shipped a defect this week; needs a ~40-line restricted-YAML reader because the toolkit has no dependencies and will not grow one |
| DT-34 | ⬜ planned | `migrate-project` ACCEPTS the shapes `series` refuses | M | [One template beats three parsers][one-template-beats] | a converter that refuses what the checker refuses can never migrate anything, so the register-shape reading reverted out of `series` belongs here, where guessing is appropriate because a human reviews the emitted diff |
| DT-33 | ⬜ planned | Configurable template roots, with the builtin as the fallback | M | [One template beats three parsers][one-template-beats] | lets a consumer keep its own canon instead of adopting the toolkit's, and the shape becomes DECLARED rather than sniffed — which is what separates it from the reverted `DT-25`/`DT-28` |
| DT-39 | ⬜ planned | A derived `Last Used` must refuse to reconcile DOWNWARD | S | [One template beats three parsers][one-template-beats] | during a re-charter the series spans two repos, so deriving from one is systematically LOW — and low hands out a taken number; measured live on `DW-025`, where correcting the register down to match would have written a collision in as an instruction |
| DT-40 | ⬜ planned | epo:slice qualified references, and a Registry column | M | [One template beats three parsers][one-template-beats] | DT-1..DT-39 mean different slices in ewc3-docs-tools and MedAR DevTools — 39 overlapping IDs across two estates; a qualifier cannot be mistaken for a mint because every declaring pattern needs - where a qualifier puts : |
| DT-32 | ⬜ planned | One canonical register template, and refuse anything else | M | [One template beats three parsers][one-template-beats] | five MedAR registers in three shapes and three repos with none; the checker learned all three rather than the estate adopting one, which is backwards and does not scale to a fourth |
| DT-26 | ⬜ planned | `migrate-project` emits from ONE source, so extra planning surfaces are dropped | M | — | measured on MedAR_AI_Runtime: 41 declared IDs, 34 emitted slice documents, and the 7 lost are exactly its backlog's — a burst that looks complete and silently discards whatever the roadmap glob did not select |
| DT-27 | ⬜ planned | Refuse an ID cell that ALMOST parses, instead of dropping it | S | — | `AIR-19 (was VS-19)` in a declaring position makes the ID vanish from every check rather than fail one; a rename convention that is right in prose silently unmakes the slice in an ID cell |

## Done

| ID | State | Slice | Est | Doc | Status |
| --- | --- | --- | --- | --- | --- |
| DT-5 | ✅ done | `series`: prefix ownership and derived last-used numbers | M | [Adopting](../Adopting.md) | enforced in CI; `FIX` established as repo-local canon |
| DT-6 | ✅ done | Shell shortcuts for non-Node repositories | S | [Adopting](../Adopting.md) | `docsfix` / `docscheck` / `docsseries` / `docsready`, preferring an npm script when present |
| DT-7 | ✅ done | Fix the silent `**` glob bug | S | — | `docs/**.md` matched only the top level; a consumer was checking 15 of 39 files and passing |
| DT-8 | ✅ done | Config may also live at `config/ewc3-docs.json` | S | [Adopting](../Adopting.md) | plus `--config`; two config files is now an error rather than one being ignored |
| DT-9 | ✅ done | Wrapping never breaks an inline code span, nor starts a line with `<` | S | — | a split span defeats the line-based code-span stripping in all three scanners; a wrapped `<!--` becomes an HTML block the splitter then freezes forever (both verified against GitHub's renderer) |
| DT-10 | ✅ done | `values` ignores markers inside code spans and fences | S | [For agents](../For_Agents.md) | documenting the marker syntax used to fail the repo's own check |
| DT-11 | ✅ done | `fix`: the write-mode mirror of `check` | S | [Reference](../Reference.md) | every guide referenced it for a week before it existed; a fallback swallowed the exit code |
| DT-12 | ✅ done | Full command, config, and resolver reference | M | [Reference](../Reference.md) | complete published surface, now that other repositories are adopting the toolkit |
| DT-13 | ✅ done | Tests asserting the docs cover the code's surface | S | [Reference](../Reference.md) | commands, resolvers, config fields, format options, skipped dirs — all derived from source |
| DT-14 | ✅ done | `format` converges in one pass on a CRLF file | S | [Reference](../Reference.md) | it never converged: rewrapped prose lost its carriage returns while verbatim lines kept theirs, so `fix` was always followed by a failing `check` |
| DT-17 | ✅ done | `scratch/` skipped by default, like `archive/` | S | [Reference](../Reference.md) | a pasted review was reported as an orphan; working material is not part of the documentation graph |
| DT-18 | ✅ done | `tables`: report a row whose cell count disagrees with its header | — | [Reference](../Reference.md) | **backfilled** — shipped into the `check` pipeline without a row here; reports and never rewrites, because a bare pipe is ambiguous |
| DT-19 | ✅ done | `migrate-project`: emit a migrated planning surface beside the live one | — | [Reference](../Reference.md) | **backfilled** — writes only `docs/project_v2/`, dry-run without `--write`, and leaves a GLOBAL prefix unclaimed rather than self-awarding it |
| DT-20 | ✅ done | `slices`: one document per slice, extracted from the index | — | [Reference](../Reference.md) | **backfilled** — evidence is gathered and never asserted as completion, which a test enforces in the emitted prose |
| DT-24 | ✅ done | Declaring positions: see IDs outside the first table column | S | [Reference](../Reference.md) | a backlog written as a numbered list of backticked IDs was invisible to every extractor in the estate, hiding four real cross-repo collisions; the separator after the ID is what keeps a citing bullet from minting |
| DT-25 | ↩️ reverted | `series` reads the MedAR register shape | S | [Reference](../Reference.md) | **reverted 2026-09-02** — the register is brought to the template, not the parser to the register. The backlog-inherits-its-roadmap half was kept |
| DT-28 | ↩️ reverted | Read a legacy register instead of refusing it | S | [Reference](../Reference.md) | **reverted 2026-09-02.** I argued a checker must read the estate as it is; that assumed migrating was expensive, and it is a header row. Each shape a parser learns is one it will half-accept a fourth version of, silently |
| DT-29 | ✅ done | A declared `Scope` column, and a freeze that actually holds | M | [Reference](../Reference.md) | scope was guessed from the prefix string against a hardcoded set of one; a register saying a series is **retired** now records a ceiling and minting past it fails, instead of the retirement living in prose no parser reads |
| FIX-1 | ✅ done | `Overview.md` said "nothing built" of two partly-built proposals | — | [Overview](../Overview.md) | found while orienting; the sentence outlived the fact by several shipped commands, which is what `DT-22` is for |

## Notes

**Read the convention people already wrote.** `DT-25`, `DT-28` and `DT-29` all landed by teaching
the tool to read registers exactly as three different repositories had already written them —
`| Series |`, a `Last Num` column, `FROZEN at 08`. None of those repositories had to learn a format.
The counter-example from the same week is an invented rename annotation the parser could not read at
all. A checker that defines a shape needs the whole estate migrated before it is honest, and **an
auditor that presupposes the shape it audits for is blind exactly where compliance failed** — which
is the only place it was needed.

**Every check here exists because of a specific failure**, not a style preference. That is the bar
for adding another one: it has to have already gone wrong somewhere, quietly, in a way nobody
caught.

[epqe]: https://github.com/ewc3labs/excel-power-query-editor
[frontmatter-is-the]: ../design/frontmatter-is-the-declaration.md
[one-template-beats]: ../design/one-template-beats-three-parsers.md
[one-thing-to-edit]: ../design/one-thing-to-edit.md
[prefix-registry]: https://github.com/ewc3labs/ewc3labs-hq/blob/main/docs/project/EWC3_Prefix_Registry.md
[recall-tape]: https://github.com/ewc3labs/ewc3-recall-tape
