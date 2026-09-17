---
id: DOCS-075
state: ⬜ planned
title: "migrate-project: evidence recorded before an ID was minted is set apart, not attributed to the slice"
est: M
doc: "[DOCS-075](slices/DOCS-075_migrate_project_evidence_recorded_before_an_ID_was_minted.md)"
status: ""
---

# DOCS-075 — migrate-project: evidence recorded before an ID was minted is set apart, not attributed to the slice

A downstream conversion found evidence attributed to the **wrong slice**. The generated
`## Recorded evidence` section in each slice document collects every STATUS line whose text mentions
the slice's id. An id **used before it was minted** breaks that:

- a register's last number was `X-005`;
- two commits and a STATUS line used `X-006` and `X-007`, unminted, for some piece of work;
- the register later minted `X-006` and `X-007` for **unrelated** work;
- `migrate-project` put the earlier STATUS line under the new `X-007` as its evidence.

No gate catches it: the id is valid, the line really does mention it, and the section says it was
gathered mechanically. A human reading the document found it.

## Where

`evidenceFor(text, ids)` in `lib/slices.js` matches ids by text, with no notion of time.

## Fix

**Set apart, never drop.** Migration is non-destructive, so a line is never discarded. It moves into
its own clearly labelled group.

- **When the id was minted:** the date of the first commit that added its row to a roadmap, found
  with `git log --reverse -G` on a padding-insensitive row pattern (`\|\s*X-0*7\s*\|`) over the
  roadmap files. Rows moved between roadmaps still count, because the first appearance anywhere is
  the one that matters.
- **When the evidence was recorded:** the first ISO date (`YYYY-MM-DD`) in the line; if there is
  none, the line's `git blame` date in the STATUS file (one blame per file).
- A line recorded **before** its id was minted goes under a separate subheading instead of the
  slice's evidence:

  ```text
  **Mentioned before X-007 was minted (2026-08-12)** - most likely an earlier, unminted use of the
  number for other work. Kept for the record; not evidence for this slice.
  ```

- The same day counts as not before, so it stays as evidence: a mint and its first status line often
  share a date.
- **No history available** (not a git repository, a shallow clone, or no row ever committed):
  nothing is split, and the section says the dates could not be checked. It never guesses.
- The dry-run report counts the lines set apart per slice, so the owner review sees them.

`fold` is unaffected: it reads trailers, which cannot predate their own commit.

## Tests

- A STATUS line dated before the commit that added the id's row goes under the "before it was
  minted" subheading, not the evidence list.
- A line dated on or after that commit stays as evidence.
- An undated line is placed by its blame date.
- Padding: a `X-7` row history matches `X-007` evidence.
- No git history: nothing is split, and the section says the dates were not checked.
- The dry run reports the count per slice.
