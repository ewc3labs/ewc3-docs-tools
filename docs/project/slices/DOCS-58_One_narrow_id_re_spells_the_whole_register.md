---
id: DOCS-58
state: ⬜ planned
title: 'One narrow id re-spells every other id in the register, and `index --write` applies it'
est: M
doc: '[DOCS-58](slices/DOCS-58_One_narrow_id_re_spells_the_whole_register.md)'
status: 'measured on the real DevTools shape: DT-090 and DT-092 become DT-90 and DT-92 because DT-01 sets the derived width to 2; migrate leaves the register clean and the documented next step applies the damage'
priority: high
lane: migrate
---

# DOCS-58 — One narrow id re-spells every other id in the register

Padding width is **derived from the rows**. A single id narrower than the rest lowers the derived
width for the whole file, and every other id is re-spelled to match it.

## Measured on the real DevTools shape

DT supplied their header and the `DT-01` row. Fixture built from it, then the documented sequence:

```
BEFORE           | DT-090 | DT-01 | DT-092
after migrate    | DT-090 | DT-01 | DT-092      <- register untouched, looks safe
slice filenames    DT-01    DT-90    DT-92      <- ALREADY re-spelled, in the documents
after index      | DT-90  | DT-01 | DT-92       <- applied to the register
```

**`migrate-project` leaves the register correct and writes the corruption into the documents;
`index --write` then puts it in the register.** The migration looks clean at the moment anyone would
inspect it. That is `DOCS-53`’s shape a second time: the damage is latent in the emitted documents
and applied by the step documented to follow.

On DevTools this is **92 rows re-spelled** — and by `DOCS-49`’s one-spelling-per-id rule, every
citation of `DT-090` anywhere in the estate stops resolving.

⚠️ **I under-reported this to DT.** My first fixture grepped only for the `DT-01` row, so I told
them *"DT-01 is safe, not re-padded"* — true, and dangerously incomplete. `DT-01` is the one id that
survives; it is the survivor because it is the one setting the width everything else is dragged to.
**Checking the row I was warned about, and not the rows around it, is the same wrong-property error
this estate has been cataloguing all week.**

## Cause, and it is a rule applied mechanically

`widthOf(prefix)` reads the register and takes the shortest id as the convention — `DOCS-44`’s *"the
SHORTEST ID states the convention"*, which is correct as a **description of a consistent register**
and wrong as an **instruction to a rewriter**. One deliberate exception inverts it.

This is `DOCS-55` with the polarity reversed and both are the same defect: **a width nobody
declared, derived from rows and then written back over them.** `DOCS-55` derived 5 and produced
`DT-00054`; this derives 2 and produces `DT-90`. PMO ruled the general form the same afternoon:

> **DERIVE WHAT CHANGES, DECLARE WHAT MUST NOT.**

The padding minimum belongs in the Number Series table as a declared pattern — `DOCS-49`’s
backticked `Prefix` cell — never inferred from the population it is about to rewrite. A minimum
derived from the rows is circular by construction.

## Fix

1. **Never re-spell an id that already exists.** A migration carries ids across verbatim; padding
   applies only when MINTING a new one. Nothing about moving a row into a document requires
   respelling its id.
2. **Take the declared minimum when the register declares one**, and refuse rather than derive when
   it does not — `DOCS-49` already specced the cell.
3. **Report a register whose ids are not one width**, since that is a real finding about the
   register and currently resolves itself silently into whichever answer the narrowest row gives.

⛔ **DevTools must not adopt until this lands** — `DOCS-57` alone would have cost them their
pointers; this costs them 92 ids and every citation of them.

## Provenance, disclosed by DT — and it makes the fix structural rather than safer

DT put on record that **they created this hazard the same afternoon**. `DT-01` landed under a PMO
ruling they asked for and agree with — *a retired ID keeps its row, recorded exactly as issued,
because a deleted row is what makes an honest citation orphan.* Correct on its own terms, and it is
precisely what set the derived width to 2.

> **A governance fix landed this afternoon armed a migration hazard that was not there this morning.**

Their generalisation is the reason *never re-spell an existing id* is right rather than merely
safer:

> A register is not a static shape to be normalised toward. **It accumulates deliberate exceptions
> over time, each one load-bearing for a citation somewhere**, and every one of them looks like an
> inconsistency to a rewriter. A rewriter that normalises toward the observed convention is wrong
> not occasionally but **structurally**, because the exceptions are the whole reason the register is
> authoritative.

Mine acquired one today; another will acquire one next week. There is no version of "derive the
convention from the rows" that survives that.

DT also matched the sampling error: they reported a suite "green" that was 43 of 48 and had been
rotting since April, by running the tests they had written. **The warning names where to look, and
that is exactly what makes it the wrong sample.**
