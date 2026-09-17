---
id: DOCS-078
state: ⬜ planned
title: "a set-aside is a prompt for the owner, not a verdict: neutral wording, and the backfill shape named"
est: S
doc: "[DOCS-078](slices/DOCS-078_a_set_aside_is_a_prompt_for_the_owner_not_a_verdict_neutra.md)"
status: ""
---

# DOCS-078 — a set-aside is a prompt for the owner, not a verdict: neutral wording, and the backfill shape named

`DOCS-075` sets apart evidence recorded before its id's row existed, and tells the reader what that
means: *"most likely an earlier, unminted use of the number for other work"*. On a **backfilled
row** that story is exactly backwards.

Measured downstream: a `FIX` row added today for work delivered eight days earlier. All six of its
STATUS lines predate the row, so all six were set apart and a single later line was left as the
slice's evidence. The split is mechanically correct — those lines really were recorded before the
row existed — but the sentence explaining it is wrong, and a reader who trusts it draws the wrong
conclusion. The owner moved them back by hand.

## The rule this changes

A set-aside is a **prompt for the owner**, never a verdict. The tool knows *when* a line was
recorded and *when* the row first appeared. It does **not** know which of the two stories is true:

- the number was used before it was minted, for other work — the `DOCS-075` case; or
- the row was written down after the work it records — a backfill.

## Fix

- The heading loses its story: `### Recorded before this row existed (<date>)`, naming the id and
  the date its row first appeared.
- The sentence states both readings and asks for a decision, rather than asserting one.
- **The backfill shape is named from the data, not guessed at.** When *every* line matched for an id
  is earlier than its row, that is the signature of a backfilled row, and the section says so:
  *"every line for `<ID>` predates its row, which is what a row written down after the work looks
  like."* When some lines are earlier and some later, it says that instead.
- Unchanged: nothing is dropped, the lines keep their file grouping, and the dry-run count still
  reports what was set apart.

## Tests

- The heading and body carry no "unminted use" claim; the id and the row's date are named.
- Every line earlier than the row: the backfill sentence appears.
- Some earlier, some later: it does not.
- The counting, grouping and `index --check` behaviour of `DOCS-075` are unchanged.
