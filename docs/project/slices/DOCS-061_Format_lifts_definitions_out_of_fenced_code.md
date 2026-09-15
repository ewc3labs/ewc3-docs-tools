---
id: DOCS-061
state: 🟦 tested
title: '`format` lifts reference definitions out of fenced code and re-emits them as live links'
est: S
doc: '[DOCS-061](slices/DOCS-061_Format_lifts_definitions_out_of_fenced_code.md)'
status: 'unit-tested against the exact lines it destroyed, failing before and passing after; not yet re-run across another repo'
priority: high
lane: format
---

# DOCS-061 — `format` lifts reference definitions out of fenced code

`format` protected fenced code from **wrapping** but not from its **definition** paths. It harvested
every `[label]: url` line into the foot block and stripped it from where it stood, consulting only
the marked-lines set — and fences were not in it.

## Measured, at `c2d7077`

```text
before   a fence holding two example definitions, each with a trailing annotation
after    the fence is EMPTY; both lines are at the foot as live definitions, annotations dropped
```

Reproduced against current code with a document inside the repo. An earlier repro that "passed" was
run against an absolute temp path: `format` printed *no files matched* and never ran, so it reported
no change. **An instrument that silently does nothing reads exactly like a clean result.**

## What it had already destroyed

`DOCS-051` lost both of its illustrations of the twin-link pair. One fence was left empty; the other
kept only its `^^^^ repo ^^^^ path` caret line, annotating lines that were gone. Three live
definitions appeared at its foot — one of them a literal `https://…/blob/main/...` — and became one
of the eleven link failures blamed on cross-repo resolution.

## Why the existing test never caught it

`does not touch fenced code` has existed all along and passed throughout. It fences an **inline**
link, which the wrapper already skipped. It never fenced a **definition** line. **A test named for a
guarantee exercised the half of it that was never broken.**

## Fix

Fenced lines — delimiters and contents — join the set `markedLines` returns, which every path that
rewrites a line already reads. The same single-source move `DOCS-052` made for frontmatter.

The new test fails on the old `lib/format.js` and passes on the fixed one, verified by swapping the
file rather than assumed. It also asserts that an ordinary long link in prose still relocates, so
the fix cannot pass by switching harvesting off.
