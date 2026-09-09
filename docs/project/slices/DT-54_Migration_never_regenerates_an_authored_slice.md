---
id: DT-54
state: 🟦 coded
title: '`migrate-project` must never regenerate a slice document a human already authored'
est: S
doc: slices/DT-54_Migration_never_regenerates_an_authored_slice.md
status: 'CODED - authored documents are matched by frontmatter id, kept, and REPORTED; the register points at the existing filename rather than one derived from the row'
priority: high
lane: migrate
---

# DT-54 — `migrate-project` must never regenerate a slice document a human already authored

Migration is a **one-time import**, but adoption is not instantaneous. A repo part-way through has
both kinds of row: ones nobody has written up yet, and ones somebody has. Regenerating the second
kind overwrites authored prose with a projection of the row that prose was written to replace.

Called for in [the slice-document design](../../design/the-slice-document-is-the-object.md) §9 Q2 —
*"say migration is a one-time import; add the has-frontmatter guard"* — and needed now, because
this repo is the first with authored slice documents and MedAR repos are next.

## Why it would have been silent

The generated text is **stable**, so a second run produces no diff on the rows and no diff on the
documents it already owns. The only thing that changes is the authored document, replaced by a
generated one — and a migration that runs clean twice is exactly the one nobody re-reads.

## What it does

```
wrote:  docs/project_v2/slices/  (32 documents from 35 rows and 0 narrative sections)
kept:   3 authored document(s), not regenerated
        DT-51 DT-52 DT-53
```

- **Matched on frontmatter `id`, not filename.** The filename carries a title slug that is free to
  change; the id is the commitment.
- **The existing filename is reused**, never re-derived from the row. Deriving it would emit a
  second document for one id under a different slug — **two declaring surfaces for one
  commitment**, which is the defect this model exists to remove, manufactured by the tool that
  implements it.
- **Reported, never silent.** *"32 of 35, 3 already authored"* and *"34 of 34"* are different
  facts, and a migration that quietly declines to write is indistinguishable from one that quietly
  failed to.
- **A document too malformed to declare an id is left alone and not counted as covering a row.**
  Refusing the whole migration over one bad file would be worse; claiming to have covered a row it
  could not read would be worse still.

⚠️ **Only the live tree is scanned.** `docs/project_v2/slices` is this command’s own output, and
reading it back would let a first run’s generated documents look authored to the second — freezing
the migration at whatever it first emitted, silently. Caught while writing the scan, not after.

## Verified

Two consecutive runs on this repo emit `32 documents / 3 kept` both times: idempotent, and not
frozen. `DT-51`, `DT-52` and `DT-53` keep their authored prose, and their register rows point at
the real filenames. 155 passing, 0 failing.
