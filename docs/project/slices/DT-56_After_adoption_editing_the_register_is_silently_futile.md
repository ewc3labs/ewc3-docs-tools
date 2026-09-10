---
id: DT-56
state: ⬜ planned
title: 'After adoption, editing a Delivery Index row is silently discarded by the next `index --write`'
est: M
doc: slices/DT-56_After_adoption_editing_the_register_is_silently_futile.md
status: 'the register becomes generated and nothing says so, so a row edited by hand is overwritten with no warning and exit 0; PMO had 9952 characters of live reasoning standing in exactly that position'
priority: high
lane: index
---

# DT-56 — After adoption, editing the register is silently futile

Once a repo adopts the slice-document shape, the Delivery Index is a **projection**. Editing a row
is not refused, not warned about, and not preserved — it is simply gone the next time anyone runs
`index --write`, which is the command the workflow tells them to run.

## Measured, 2026-09-09, on the adopted tree at `663f782`

```
hand-edited DT-49 row to carry new text     edit present: true
ewc3-docs index --write                     "written"        exit 0
grep for the new text                       0 occurrences
```

No error, no warning, no mention in the summary. The row is re-rendered from the document, and
whatever a human put there is discarded without ever being read.

## This is the mirror of `DT-53`, and together they are the whole trap

| | authority in practice | what is silently lost |
| --- | --- | --- |
| **before adoption** (`DT-53`) | the row, carried into `status:` | the migration — rows come back |
| **after adoption** (this) | the document | the row edit — typing goes nowhere |

**The authority flips at adoption and nothing announces the flip.** A register that reads and edits
exactly as it always did is, from one commit onward, a generated file — with no banner, no comment,
and no refusal.

## It nearly cost three days, and the near-miss is the argument

While this branch was adopting the shape, **PMO spent three days hand-editing one Delivery Index
row until it reached 9,952 characters** — `49b71eb`, `f9d68a1`, `23d2937`, all `DT-49`, the last
landing at 19:23 the night before. Those commits were live, correct, and standing in precisely the
position this defect deletes.

They survived **only because the two branches had not merged yet**. Had adoption landed first, the
next `index --write` by anyone would have erased all three, reported success, and left a clean
`git status`. The recovery here cost one extraction and one verification because the work was still
reachable in `23d2937`; after an `index --write` it would have been reachable only in reflog, and
only by someone who already suspected.

⚠️ **And PMO named the deeper version themselves**: they were *"writing into the surface I was
standing on"* — authoring in the register while ruling, in that same register, that the slice
document is the authority. **The tool offered no signal that the two had swapped.**

## Fix — refuse, do not discard

`DT-27` already ruled this shape for id cells: *an almost-parsing cell must be REPORTED, never
dropped.* The same rule, one level up.

`index` already knows the rendered row and the row on disk — it compares them to decide whether to
write. When they differ **because the row was edited**, that is not a stale projection to refresh,
it is a conflict between two authored states, and the tool cannot know which is wanted.

1. **`index --write` refuses** when a row differs from what its document declares in a way the
   document cannot explain, naming the id and printing both. Exit non-zero.
2. **`--force` to overwrite**, for the ordinary case of a document that legitimately moved ahead.
3. **`check` reports the divergence** rather than staying silent, so CI catches an edit made in the
   wrong surface before a human loses it.

The cheap half is worth having even alone: an adopted register should carry a generated-file banner
saying **where to edit instead**. That would have cost one line and saved this entire exchange.

⛔ **Blast radius on the estate is larger than here.** Every repo that adopts inherits a register
that looks editable, in an org where editing the register is what everyone has always done. The
first person to do it by habit loses their work silently — and by construction they are the person
who had something to say.

## Two failures, two owners — and the one that sets the SIZE of the loss

The first draft of this slice acquitted PMO entirely: the tool gave no signal, therefore not their
fault. **PMO declined half of that, and they are right.** Recorded in their words because the
distinction is the useful part:

| | owner | |
| --- | --- | --- |
| the silent discard (`DT-56`) | **the tool** | authority flips at adoption, nothing announces it |
| a 10,168-character register row | **PMO** | true on their branch, in their register, **before adoption existed anywhere** |

The second predates any flip. Thin-row discipline — *rows are one short sentence plus a pointer* —
was already their own rule, cited to other lanes in the same days the paragraph was growing. No
flip was involved and nothing was disguised.

> **The SIZE of a loss is set by the discipline you kept BEFORE the defect fired.**

A thin row is **176 bytes** — the number regeneration actually produced for `DT-49`. Losing 176
bytes to a silent discard is an annoyance you notice and retype. **10,168 bytes is a three-day
erasure.** Same defect, same command, same silence; the blast radius was set entirely by what had
accumulated in the cell beforehand. PMO: *"I did not cause the trap and I loaded it."*

That is worth more than either the self-blame or the acquittal, and it generalises past this bug:
**every silent-loss defect in the estate has a magnitude nobody controls at the moment it fires.**
Thin rows are not tidiness. They are a bound on how much a future silent failure can take.

## The safety feature and the recovery path are the same mechanism

Stated plainly because it is the most operationally surprising thing here, and it will be reached
for as a repair:

> **`migrate-project` does NOT recover a diverged row, by design.** `DT-54` stops it regenerating
> an authored document — and after adoption *every* migrated document is authored. So a repair
> attempt returns a clean no-op, reports `kept: N authored document(s)`, and the person running it
> concludes nothing was lost.

Measured: re-running migration from `23d2937` kept all 32 documents and emitted none. The guard
that protects human prose is the guard that blocks re-import — the same mechanism pointed in
opposite directions. Recovery of a diverged row is a deliberate extraction, not a re-run.

## A practice worth copying, from the review of this slice

PMO opened their acceptance by labelling what they had NOT checked: `dd6273d` is unpushed and
unreachable from their machine, so the byte-for-byte claim above is **my measurement, accepted on
report — not their observation.** They said so before relying on it.

That is the counter-practice to the whole class of error this estate spent two days cataloguing.
A number quoted without provenance is indistinguishable from a number verified, and the difference
only surfaces when it is wrong. **The verbatim claim gets a second witness when the branch is
pushed and PMO reads the body against their own `23d2937` text.** Until then it has one.
