---
id: DT-55
state: ⬜ planned
title: '`migrate-project` synthesises a SECOND prefix register, because it cannot read the one this repo has'
est: M
doc: '[DT-55](slices/DT-55_Migrate_bootstraps_a_second_register_it_cannot_read.md)'
status: 'BLOCKS adopting a migrated register: `migrate` cannot read the `Prefix`-first table `series` reads, so it bootstraps a duplicate that unclaims the owner and re-pads DT-54 to DT-00054'
priority: high
lane: migrate
---

# DT-55 — `migrate-project` synthesises a second prefix register

`migrate-project` emits a `## Number Series` table into a roadmap that already has `## ID Prefixes`,
producing **two prefix-declaring surfaces in one document** — the defect the whole ownership model
exists to prevent.

## Measured, 2026-09-08, at `799ea54`

```
17: ## ID Prefixes     | DT | global | ewc3-docs-tools    | DT-54     |   <- authored, correct
37: ## Number Series   | DT | global | **?** _unclaimed_  | DT-00054  |   <- generated
```

Three separate regressions in the generated copy, any one of which is disqualifying:

1. **The owner is discarded.** `ewc3-docs-tools` becomes `**?** _unclaimed_`. The bootstrap rule
   that a global prefix may not self-declare is *correct* — but it is being applied to a register
   that had already adjudicated the question.
2. **The padding contradicts the register.** `DT-54` becomes `DT-00054`, against `DT-44` (padding is
   a convention of a PREFIX, and the shortest id states it) and `DT-49` (one spelling per id). Every
   id in this repo is unpadded.
3. **The value marker is malformed**: `<!--/-->` rather than `<!--/ewc3:lastDT-->`.

⚠️ **And `series` reports the file clean.** It reads the authored table, never sees the generated
one, and prints *"Every prefix in use is declared, and no global prefix is claimed twice."* The
duplicate is invisible to the check whose entire job is duplicate declarations — `DT-30` one layer
up, in the register rather than the index.

## Cause — two components asking one question two ways

```js
const REGISTER_HEADER = /^\|\s*Series\s*\|\s*Last\s*(?:Num|used|Used)\s*\|/im;   // lib/migrate.js:49
```

That matches `| Series | Last Num |` — the DevTools/HDCTranslators shape. This repo writes
`| Prefix | Scope | Owner | Last Used | Series |`, which starts with `Prefix`, so `parseRegister`
returns `found: false` and the bootstrap path fires. **`readSeries` parses the same table
correctly.** Two readers, one question, opposite answers.

> **A repo WITH a register is told it has none, and handed a second one built from weaker
> evidence than the register it could not read.**

## Why the duplication exists at all

`readSeries` takes a **file path**; `migrate` works on **text**. There was no text-level reader to
call, so the question was re-implemented with a narrower regex. `migrate.js:187` still reaches for
one that does not exist —

```js
const { used } = readSeries.fromText ? readSeries.fromText(text) : { used: usedFromText(text) };
```

`readSeries.fromText` is not defined anywhere, so that branch has never once been taken.

**Fix: split `readSeries` into a text parser and a thin file wrapper, and have `migrate` ask the
same parser `series` asks.** Widening `REGISTER_HEADER` instead would add a THIRD grammar for one
question — which is the defect, not the remedy. `DT-27` already paid for this lesson: it was fixed
by centralising the id grammar rather than by correcting eighteen regexes.

Related and probably the same slice by the time it is built: `DT-32` (one canonical register
template) and `DT-42` (the registers disagree on shape).

## Consequence for adoption, and what was done instead

This repo's migrated register **was not adopted**. The slice documents were, and the rows were
thinned with `index --write`, which only rewrites Delivery Index rows and never touches the prefix
table. Same outcome — a thin greppable index pointing at `slices/` — reached without importing a
duplicate register.

⛔ **Do not run `migrate-project --write` and adopt its roadmap wholesale on a MedAR repo until this
lands.** Every register in the estate that uses the `Prefix`-first shape will be given a second one,
with its owner erased and its ids re-padded, and `series` will call the result clean.
