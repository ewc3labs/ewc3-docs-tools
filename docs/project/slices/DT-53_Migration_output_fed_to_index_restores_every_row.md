---
id: DT-53
state: ⬜ planned
title: '`migrate-project` output fed to `index` restores every row it just moved out'
est: S
doc: '[DT-53][dt-53]'
status: 'the migration writes a one-line register but carries the whole row into `status:`, so `index --write` - its own documented next step - puts all 34 monsters back; measured 341 to 5961 chars'
priority: high
lane: migrate
---

# DT-53 — `migrate-project` output fed to `index` restores every row it just moved out

The two halves of the migration disagree about the same cell, and the second one wins.

## Measured, 2026-09-08, on this repo at `ac7b836`

```
ewc3-docs migrate-project --write        34 documents from 34 rows
  longest register row                   341 chars   (DT-29)

ewc3-docs index --slices docs/project_v2/slices --write
  34 row(s) rendered from 34 slice document(s)
  longest register row                   5961 chars  (DT-49)
```

**341 to 5961. The migration is undone by the command documented to follow it.**

## Cause — two values written for one cell

`migrate-project` writes the Status cell of the emitted register as a pointer:

```
| DT-49 | ⬜ planned | Read the canonical Number Series table... | M | — | See [slice notes](slices/DT-49_....md). |
```

but writes the slice document’s `status:` frontmatter as **the original row, verbatim** — all 5961
characters of it. Under the slice-document model the frontmatter is the authority, so `index` is
not misbehaving: it renders what the document declares. **The document declares the monster.**

The blob is also duplicated — once in `status:`, once again as the body narrative — so the emitted
document states the same 5961 characters twice.

## Why it survived review

`migrate-project` prints an honest disclaimer:

> *"The one-line summary has deliberately not been written. ... deciding what a slice is about, and
> whether it is finished, is judgement."*

That refusal is correct and it is about `title`. **It does not extend to `status:`, which was filled
in anyway, with the one value guaranteed to reconstitute the row.** A tool that declines to guess
the summary but confidently writes the blob has refused the cheap half and taken the expensive one.

## Fix

Emit `status:` **empty**, and leave the carried-across row in the body only. The body is where
narrative belongs; `status:` is the one-line cell a human still owes. An empty `status:` renders an
empty Status cell, which is visibly unfinished — the correct state for a migration awaiting
judgement, and it cannot silently restore what the migration removed.

Alternatively write the same `See [slice notes](...)` pointer into `status:` that the register
already carries, so the two halves agree. Weaker: it looks finished when it is not.

⚠️ **Blast radius.** This is the tool built to migrate the estate’s multi-thousand-line roadmaps.
Run it on a repo, follow the documented `index` step, and the register returns to exactly the shape
the migration existed to remove — with the work appearing to have succeeded at every step. Nothing
errors, nothing warns, and the diff looks like the tool doing its job.

**Sequencing:** this blocks bulk migration of this repo’s own four monster rows (`DT-49`, `DT-48`,
`DT-27`, `DT-50` — 17,101 characters between them) and any other repo, because the migration cannot
currently be followed by the command that regenerates registers.

Related: `DT-26` (`migrate-project` emits from ONE source) and `DT-34` (`migrate-project` accepts
shapes `series` refuses) are both about this command being trusted further than it has been tested.
