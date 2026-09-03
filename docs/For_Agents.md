# For coding agents

If you are an AI agent working in a repository that uses this toolkit, this page is for you.

It is short, and it is mostly about failure modes that are specifically yours. Ask me how I know.

## The loop

```bash
docsfix          # or: npm run docs:fix
docscheck        # or: npm run docs:check
```

Run `docsfix` after **any** documentation change, before you commit. It is idempotent, so running it
when nothing changed costs a second and reports zero.

Run `docscheck` before you tell the human you are finished. If it fails, you are not finished.

## What each thing is for

| | catches |
| --- | --- |
| `format` | prose wrapped so a source line is as wide as it renders |
| `links` | dead links, **wrong-case** links, undefined references, orphaned documents |
| `values` | a number in prose that no longer matches what it counts |
| `series` | an ID prefix a roadmap has not declared, or one claimed twice |
| `tables` | a table row whose cell count disagrees with its header — usually a pipe inside a cell that needs escaping as `|` |

**The wrong-case check deserves attention.** `USER_GUIDE.md` when the file is `User_Guide.md`
resolves on Windows and macOS and fails on GitHub. It therefore works on every machine that could
catch it and breaks for every reader. You will not notice this by looking.

## Things you will get wrong

These are not hypothetical. Every one of them happened during this toolkit's own construction.

**Do not hand-edit a value between markers.** `<!--ewc3:tests-->136<!--/ewc3:tests-->` is derived.
Editing the number does nothing except make CI fail on the next run. Change what it *counts*, then
run `docsfix`.

**Do not "tidy" a marker onto its own line inside an HTML block.** A badge row is a
`<p align="center">` full of `<img>` tags. Putting an open marker on its own line inside it ends the
HTML block for some renderers — GitHub renders it correctly and a local preview does not, which is a
confusing way to find out you broke someone's README. Keep markers **inline**.

**Do not put a marker at the start of a line.** When a line begins with an HTML comment, some
renderers treat the rest of that line as raw HTML and stop parsing markdown — so
`- <!--ewc3:x-->[![Badge](img)](url)<!--/ewc3:x-->` renders as literal text. Put something before
it: `- Tests: <!--ewc3:x-->…`.

**Do not reformat `archive/` or historical documents.** Reformatting an archive rewrites the past.
Exclude those directories.

**Do not assume a check that passes is checking everything.** This toolkit shipped a glob bug where
`docs/**.md` silently matched only the top level, so a repository was checking 15 of 39 documents
and being told everything passed. If a result seems too clean, count the files.

**Do not add a marker around a number nobody was getting wrong.** Markers are for numbers that have
*demonstrated* they drift. A marker around a stable number is clutter with a maintenance cost.

## When you mint an ID

1. Read the **ID Prefixes** table in the roadmap. It names the last number used.
2. Take the next one, and confirm it is unused across every sub-table.
3. Add your row.
4. Run `docsfix` — the last-used cell updates itself.

Do not edit the last-used cell by hand. It is derived, and CI will disagree with you.

If the prefix you want is not in that table, **stop**. Either it belongs to a different repository —
check the [prefix registry][prefix-registry] — or the roadmap needs to claim it explicitly. `FIX` is
the exception: every roadmap owns its own `FIX` series.

## The rule behind all of it

**Derive what can be derived; check what cannot.**

A number that a human maintains will eventually be wrong, and it will be wrong quietly — a document
claiming 63 tests against a suite of 136 keeps rendering perfectly. Nothing is red. The only signal
is a reader who trusts it and is wrong.

So the question to ask of any number you are about to write into a document is: **what would make
this wrong, and would anything notice?** If the answer is "nothing would notice", it wants a marker
or it wants deleting.

[prefix-registry]: https://github.com/ewc3labs/ewc3labs-hq
