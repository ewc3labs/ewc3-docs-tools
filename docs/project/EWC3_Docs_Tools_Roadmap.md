# ewc3-docs-tools — Development Roadmap

## Current Focus

The toolkit is in use by [excel-power-query-editor][epqe] and [ewc3-recall-tape][recall-tape], and
CI-enforced in both. Four checks are live: `format`, `links`, `values`, `series`.

What is next is driven by the first Python consumer. The Music Forensics Workbench will be Python,
and `fromJson` cannot read `pyproject.toml` — so `DT-1` stops being theoretical the moment that repo
gets a README.

## ID Prefixes

**Read this before minting an ID.** It sits above the tables because it is an input to writing one,
not a summary of them.

| Prefix | Scope | Owner | Last Used | Series |
| --- | --- | --- | --- | --- |
| DT | global | ewc3-docs-tools | <!--ewc3:lastDT-->DT-14<!--/ewc3:lastDT--> | toolkit features and fixes |
| FIX | repo-local | ewc3-docs-tools | <!--ewc3:lastFIX-->FIX-0<!--/ewc3:lastFIX--> | small corrections not worth a slice |

**Last Used is derived** from the tables below by `ewc3-docs values`, and CI fails if it is stale.
**Max, not a count** — counting rows agrees with the highest ID only while a series is contiguous.

**A global prefix belongs to exactly one roadmap** across EWC3 Labs; see the [prefix
registry][prefix-registry]. **`FIX` is repo-local and that is canon** — every roadmap owns its own,
because a fix is never referenced from outside the repository it fixes.

## Delivery Index

**Rows are one line.** Anything wanting a paragraph wants a slice document.

| ID | State | Slice | Est | Doc | Status |
| --- | --- | --- | --- | --- | --- |
| DT-1 | ⬜ planned | Read values from TOML, for Python repos | S | — | `fromJson` cannot read `pyproject.toml`; the workaround is writing JSON from a build step, which is not always available |
| DT-2 | ⬜ planned | `format --check` should say WHAT would change | S | — | it names the file and not the reason, so the fix is "run the tool and read the diff" |
| DT-3 | ⬜ planned | Publish to npm rather than installing from git | M | — | `github:` specs work but pin nothing; a version number would let consumers upgrade deliberately |
| DT-4 | ⬜ planned | Anchor checking for `[text](file.md#heading)` | M | — | the file is verified, the heading is not, so a renamed heading breaks silently |

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

## Notes

**Every check here exists because of a specific failure**, not a style preference. That is the bar
for adding another one: it has to have already gone wrong somewhere, quietly, in a way nobody
caught.

[epqe]: https://github.com/ewc3labs/excel-power-query-editor
[prefix-registry]: https://github.com/ewc3labs/ewc3labs-hq/blob/main/docs/project/EWC3_Prefix_Registry.md
[recall-tape]: https://github.com/ewc3labs/ewc3-recall-tape
