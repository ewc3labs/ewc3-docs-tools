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
