---
id: DOCS-089
state: 🟦 tested
title: "one State: under several Slice: lines is refused - it reads as all of them and moves only the last"
est: S
doc: "[DOCS-089](slices/DOCS-089_one_State_under_several_Slice_lines_is_refused_it_reads_as.md)"
status: ""
state_sha: 44e8b3d80fd2
state_source: trailer
---

# DOCS-089 — one State: under several Slice: lines is refused - it reads as all of them and moves only the last

## Measured downstream

A commit closing several slices carried several `Slice:` lines and one `State:` under them. `fold`
moved **only the last**. A retry with one slice per commit moved them all. Nothing had said
anything: the commit passed `--check-message` and `fold --check`.

## Not a parser bug: the grammar, read the wrong way

The contract is "each `State:` belongs to the nearest `Slice:` above it; a `Slice:` with no `State:`
is a timeline event". So `fold` did exactly what was written. But the block reads as "all of these
are coded", and every lane that wrote it read it that way. A grammar whose obvious reading is wrong,
and which says nothing, is a silent partial apply.

## The rule

A state-less `Slice:` **directly above** a `Slice:` that has a `State:` is refused, naming the
slices that get no state change:

```text
State: coded applies only to Slice: VS-3 - Slice: VS-1, Slice: VS-2 above it get no state change.
Give each Slice: its own State:, or move a timeline-only Slice: below the State:
```

- It lives in `parseTrailers`, so `--check-message`, `fold --check`/`--write` over history and
  `--commits-from` all apply it. History follows the trailer rule: an **error** after `--since`, a
  **warning** in full history.
- **The pairing does not change.** The last `Slice:` still gets the `State:`; this slice adds a
  refusal, not a second reading.
- **Timeline events stay legal** where the shape is unambiguous: a state-less `Slice:` written
  *below* a paired one, or a commit with no `State:` at all.

Refused rather than noted: a note on a passing check is how this went unseen.
