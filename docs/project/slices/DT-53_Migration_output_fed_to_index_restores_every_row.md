---
id: DT-53
state: 🟦 coded
title: '`migrate-project` output fed to `index` restores every row it just moved out'
est: S
doc: '[DT-53][dt-53]'
status: 'CODED - the narrative moves to the body and `status:` is emitted empty, so a migrated register survives its own `index --write`; measured 341 to 341, and the round-trip test now asserts idempotence rather than the identity that encoded the defect'
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

## Fixed 2026-09-08

`lib/slices.js` — the cell that becomes the body narrative is no longer also declared in
frontmatter. Emptied rather than deleted, and only when it actually reached the body, so a family
member whose row was never rendered into a narrative keeps its own.

```
before   migrate 341 -> index 5961      the migration undone
after    migrate 341 -> index 341       stable
```

All 35 emitted documents carry `status: ""`; every body retains its paragraph.

**The pointer moved to `Doc`, which is the column that means it.** Emptying the Status cell would
otherwise have taken `See [slice notes](...)` with it, leaving a register that could not reach its
own documents. It is written as a **plain path**, not a markdown link, because `links` reads
frontmatter as prose and reports a link in a field value as an undefined reference — `DT-52`. It is
greppable today and becomes a link when that lands. An authored `Doc` value is never replaced:
`DT-5` keeps `[Adopting](../Adopting.md)`.

### The test that had to change, and why that is not test-fitting

`[index] a register regenerates from the documents it just produced` asserted:

```js
assert.strictEqual(res.text, ROADMAP,
  'a register that has just been migrated must regenerate to itself, byte for byte');
```

**That invariant is the defect, written down as a requirement.** Byte-for-byte identity after a
migration means the paragraph is still declared in frontmatter — which is exactly why `index
--write` restored all 34 rows. A test asserting the register comes back unchanged is a test
asserting the migration did nothing.

Replaced with the two properties that were actually wanted, and it is strictly stronger than what
it replaces because it now checks both halves:

1. **Idempotence from the second pass** — an *already migrated* register regenerates to itself,
   byte for byte. Migration is a deliberate one-time relocation; everything after it is stable.
2. **Losslessness** — the narrative is asserted present in a document body and absent from the
   register row. Checked on a named cell rather than a count, so a regression that empties the
   body as well as the row cannot pass.

154 passing, 0 failing.

### Next, and deliberately not done here

An empty `status:` is the seam a summariser writes into — MedAR is standing up a local LLM endpoint
for exactly this, and an empty cell is an honest *"a one-line summary is owed"* marker that a
generated placeholder would hide. Options, Wilson’s call: dogfood a local endpoint in this repo, or
coordinate with **DT** and **AIR** to use the `cictl` tooling on the MedAR network.

Until then the four monster rows in this register — `DT-49`, `DT-48`, `DT-27`, `DT-50`, 17,101
characters between them — can be migrated whenever wanted; the summaries are the human half.