---
id: DOCS-056
state: 🟦 tested
title: 'After adoption, editing a Delivery Index row is silently discarded by the next `index --write`'
est: M
doc: '[DOCS-056](slices/DOCS-056_After_adoption_editing_the_register_is_silently_futile.md)'
status: 'L1 and L2 built: index --write refuses a hand-edited row, index --check fails a diverged one; 27 controls unit-tested, index --check green locally on all 43 rows here and added to CI; not yet run on an estate register'
priority: high
lane: index
---

# DOCS-056 — After adoption, editing the register is silently futile

Once a repo adopts the slice-document shape, the Delivery Index is a **projection**. Editing a row
is not refused, not warned about, and not preserved — it is simply gone the next time anyone runs
`index --write`, which is the command the workflow tells them to run.

## Measured, 2026-09-09, on the adopted tree at `663f782`

```
hand-edited DOCS-049 row to carry new text     edit present: true
ewc3-docs index --write                     "written"        exit 0
grep for the new text                       0 occurrences
```

No error, no warning, no mention in the summary. The row is re-rendered from the document, and
whatever a human put there is discarded without ever being read.

## This is the mirror of `DOCS-053`, and together they are the whole trap

| | authority in practice | what is silently lost |
| --- | --- | --- |
| **before adoption** (`DOCS-053`) | the row, carried into `status:` | the migration — rows come back |
| **after adoption** (this) | the document | the row edit — typing goes nowhere |

**The authority flips at adoption and nothing announces the flip.** A register that reads and edits
exactly as it always did is, from one commit onward, a generated file — with no banner, no comment,
and no refusal.

## It nearly cost three days, and the near-miss is the argument

While this branch was adopting the shape, **PMO spent three days hand-editing one Delivery Index row
until it reached 9,952 characters** — `49b71eb`, `f9d68a1`, `23d2937`, all `DOCS-049`, the last
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

`DOCS-027` already ruled this shape for id cells: *an almost-parsing cell must be REPORTED, never
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
| the silent discard (`DOCS-056`) | **the tool** | authority flips at adoption, nothing announces it |
| a 10,168-character register row | **PMO** | true on their branch, in their register, **before adoption existed anywhere** |

The second predates any flip. Thin-row discipline — *rows are one short sentence plus a pointer* —
was already their own rule, cited to other lanes in the same days the paragraph was growing. No flip
was involved and nothing was disguised.

> **The SIZE of a loss is set by the discipline you kept BEFORE the defect fired.**

A thin row is **176 bytes** — the number regeneration actually produced for `DOCS-049`. Losing 176
bytes to a silent discard is an annoyance you notice and retype. **10,168 bytes is a three-day
erasure.** Same defect, same command, same silence; the blast radius was set entirely by what had
accumulated in the cell beforehand. PMO: *"I did not cause the trap and I loaded it."*

That is worth more than either the self-blame or the acquittal, and it generalises past this bug:
**every silent-loss defect in the estate has a magnitude nobody controls at the moment it fires.**
Thin rows are not tidiness. They are a bound on how much a future silent failure can take.

## The safety feature and the recovery path are the same mechanism

Stated plainly because it is the most operationally surprising thing here, and it will be reached
for as a repair:

> **`migrate-project` does NOT recover a diverged row, by design.** `DOCS-054` stops it regenerating
> an authored document — and after adoption *every* migrated document is authored. So a repair
> attempt returns a clean no-op, reports `kept: N authored document(s)`, and the person running it
> concludes nothing was lost.

Measured: re-running migration from `23d2937` kept all 32 documents and emitted none. The guard that
protects human prose is the guard that blocks re-import — the same mechanism pointed in opposite
directions. Recovery of a diverged row is a deliberate extraction, not a re-run.

## A practice worth copying, from the review of this slice

PMO opened their acceptance by labelling what they had NOT checked: `dd6273d` is unpushed and
unreachable from their machine, so the byte-for-byte claim above is **my measurement, accepted on
report — not their observation.** They said so before relying on it.

That is the counter-practice to the whole class of error this estate spent two days cataloguing. A
number quoted without provenance is indistinguishable from a number verified, and the difference
only surfaces when it is wrong. **The verbatim claim gets a second witness when the branch is pushed
and PMO reads the body against their own `23d2937` text.** Until then it has one.

## Why `feature/declaring-positions` still carries the fat row — do not "fix" it

PMO's branch still holds `DOCS-049` at 10,168 characters, and it is **deliberately frozen there**,
not overlooked. Their reasoning, which is a design rule rather than deference:

> Thinning it there would produce a second, independently-authored thin version of a row this branch
> has already thinned — **one fact, two places, hand-made twice.** *The fix for a row existing in two
> forms is not to fix it in both.*

So the correct action on that branch is **none**, until adoption lands and the row regenerates from
the document. Anyone who finds the fat row and tidies it is manufacturing the duplicate-authoring
defect that `DOCS-030`, `DOCS-048` and this slice are all circling — and doing it while believing
they are cleaning up.

## Correction — the claim was "byte for byte" and it decayed

PMO fetched `497a9ea`, read the DOCS-049 body against their own `23d2937` register cell, and found
the claim above overstated:

```
their status cell                    9,952 chars
words of theirs absent from the doc  0
corrections intact                   the DT-01 strike, RULED 09-09, MEASURED 09-09 — all present
byte-for-byte                        NO — diverges at char 97

  theirs  "Prefix (a backticked pattern, unambiguous)"
  ours    "Prefix (a backticked\npattern, unambiguous)"
```

**`format` wrapped the line** — doing precisely its documented job, *wrap prose so a source line is
as wide as it renders, never change a word.* Nothing was lost. The honest wording is **word-for-word
after a documented reflow**, and `byte for byte` is retired.

⭐ **And the sharper version, which neither of us said first: the claim was TRUE WHEN MADE.** It was
measured at `dd6273d`, before `DOCS-052`'s fix existed. `497a9ea` then ran `format` across all 40
slice documents — the very fix that made running it safe — and reflowed this body. **A verified
measurement decayed because a later, correct, documented operation changed the thing measured.**

That is the same shape this estate spent two days on, arriving in the verification rather than the
defect: a review is not a value that stays true, and a number is only a fact about the commit it was
taken on. **Quote the commit with the number, or the number outlives its truth.**

`9,952 chars, 0 words lost, reflowed by format` survives being repeated. `byte for byte` would have
been quoted for a year and been wrong.

⚠️ PMO also caught their own instrument mid-probe: a case-sensitive predicate reported this document
missing *"one row invalidated"*, which it carries in capitals. They did not send it — **a single NO
among YESes is more likely the instrument than the file.** Fourth naive-predicate false positive in
the estate in two days.

## Built, 2026-09-16 — two gates, and where they depart from the fix above

The fix above was drafted before review. PMO specified it, LabsHQ reviewed it adversarially, and
what was built differs in three places, each for a stated reason:

| drafted | built | why |
| --- | --- | --- |
| `--force` to overwrite | **no `--force`** | a document edit alone never refuses, because the baseline is git and not the render. The only thing `--force` could overwrite is a hand edit, and `git checkout` already does that visibly |
| `check` reports the divergence | **`index --check`** | `check` is red wholesale on SX_Coder (788 format, 272 links), so a gate inside it would be ignored with the rest |
| compare the row with its render | **compare cells, against git** | a row cannot say whether it was typed or rendered, but its history can |

- **L1, `index --write`**, refuses a row whose cells match neither the committed version at HEAD nor
  the version `index` last wrote since HEAD, stored per worktree under
  `git rev-parse --git-path ewc3-docs/index-last.json`. That second baseline is LabsHQ finding 3.
  Without it, render, edit the document, render again refuses its own output. A row with no history
  is written only if nothing typed is lost, meaning every non-empty cell other than the ID already
  renders. "No history" alone was the first rule, and Codex (PR #6, P1) showed a renamed ID getting
  a hand edit past it with exit 0. The decision covers every roadmap before any is written.
- **L2, `index --check`**, fails on a diverged row, a row with no document, a document with no row,
  and one ID on two rows. It needs no git history. **Only L2 catches a hand edit that was
  committed.**
- **Two hazards, two gates** (control H, refined by Codex on PR #6). An operation in progress
  (merge, rebase, cherry-pick or revert) makes HEAD the wrong baseline, so `--write` refuses and
  `--check`, which never reads HEAD, still runs. Unresolved conflicts make the tree itself
  unreadable, so both refuse. The first build refused `--check` on the operation, which was the
  wrong signal.
- **Exit contract, every command:** 0 consistent, 1 diverged (always named), 2 did not run. A crash
  exits 2. It used to exit 1 with a stack trace, and the first control run counted every crash as a
  catch.

### Found by dogfooding: formatting alone made every row diverge

The first `index --check` on this repository failed **all 43 rows**. `index` renders
`[DOCS-001](slices/...)`, and `format` then rewrites that to `[DOCS-001][docs-001]` plus a
definition. GitHub renders the two identically. The same DOCS-059 disagreement that the cell
comparison already absorbed for padding came back through link style. The comparison now resolves a
reference link to its definition, which is what GitHub does. A definition pointing elsewhere, or
sitting inside a fence, still differs, so the comparison hides no real change. Control L pins all
three cases.

Codex found the hole in that claim on PR #6. A definition inside raw HTML, such as a comment,
defines nothing on GitHub, but the parser read it. The first definition wins, so a commented-out old
target shadowed the live one and `--check` passed a link GitHub renders somewhere else. HTML blocks
are now excluded like fences, and control L pins a comment and a `<details>` block.

### Not built

- **The generated-file banner** is still worth its one line and is still missing.
- **`index --write` and `format` still undo each other** (DOCS-059). The gates no longer care, but
  the churn in `git diff` remains.
- **Not yet run on an estate register.** 27 controls, one repository, green locally. The next
  evidence is `index --check` on an adopted MedAR register.
