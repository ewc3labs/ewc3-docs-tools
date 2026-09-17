---
id: DOCS-079
state: ⬜ planned
title: "migrate-project: evidence under an id's former name, bounded, and dated against the id it was written under"
est: M
doc: "[DOCS-079](slices/DOCS-079_migrate_project_evidence_under_an_id_s_former_name_bounded.md)"
status: ""
---

# DOCS-079 — migrate-project: evidence under an id's former name, bounded, and dated against the id it was written under

A repository that **renumbered** its ids keeps its old evidence under the old name. Migration
gathers `Recorded evidence` by grepping the id a row carries **now**, so every line written before
the renumber is invisible — and an absent section is invisible to every gate, because nothing counts
the sections that should exist.

Measured downstream on one repository that renumbered 1:1 and deliberately did **not** rewrite
history (a wrong pointer is corrected by a readable correct pointer, not by rewriting the past):

- its status file holds **80** mentions of old-series ids against **12** of the new;
- **14 of 37** slice documents have an evidence section at all;
- one slice has about **ten** lines under its old id and **no evidence section**.

## What this needs, and the two things that make it safe

**1. Bounded by construction, never by luck.** That repository's status file also cites an id from
*another* repository's series in the same old prefix. An unbounded `OLD` → `NEW` alias maps it too,
and is harmless only because no id of that number exists here. So:

- `--alias-id <OLD>=<NEW>`, repeatable, needs no bounds: each pair is explicit.
- `--alias-prefix <OLD>=<NEW>` is refused **unless** bounded by both `--alias-through <OLD-ID>` (the
  renumber's highest id) and `--alias-before <YYYY-MM-DD>` (the date the renumber landed). Outside
  either bound, a mention is not aliased.
- Both forms also live in config (`evidence.aliases`), because a renumber is a property of the
  repository, not of one run, and a cutover has to be reproducible.

**2. An aliased line is dated against the id it was WRITTEN under.** This is the part that would be
wrong if it were built in a hurry. Every aliased line predates the new row by definition, so with
`DOCS-075` dating unchanged, all 80 lines land under "recorded before this row existed" —
`DOCS-078`'s problem multiplied. So the alias carries into the dating: a line matched by alias is
dated against the **old** id's first row, which is in history and is what those lines were recorded
against. A line that predates *that* row is genuinely earlier work.

## Also

- The report names each alias, how many lines it matched, and **any alias that matched nothing**, so
  a stale or mistyped alias is visible rather than silently inert.
- The report counts slices with **no** evidence at all (`evidence: 14 of 37 slices have any`). That
  is the number that made the gap invisible; printing it makes an absent section a fact somebody can
  look at.

## Tests

- `--alias-id` pairs; an aliased line appears as evidence for the new id.
- `--alias-prefix` without both bounds is refused, exit 2, naming what is missing.
- An id above the ceiling, or a line dated after the renumber, is not aliased.
- An aliased line older than the **old** row is still set apart; one between the old and new rows is
  evidence, not a set-aside.
- An alias matching nothing is reported.
- The "N of M slices have any evidence" count.
