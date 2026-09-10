---
id: DOCS-60
state: ⬜ planned
title: 'Both register readers are blind to the other shape, and one comment claims otherwise'
est: M
doc: '[DOCS-60](slices/DOCS-60_Both_register_readers_are_blind_to_the_other_shape.md)'
status: 'found by Copilot on PR #2: `readSeries` documents accepting `Prefix` OR `Series` and matches only `Prefix`, which is why 4 of 6 estate registers read as declaring nothing'
priority: high
lane: series
---

# DOCS-60 — Both register readers are blind to the other shape

`DOCS-55` recorded that `migrate` cannot read the `Prefix`-first table `series` reads. The inverse
is also true, and it is worse, because **the code says it was already fixed.**

## Measured, `lib/series.js:326-332`

```js
// Two spellings, one meaning. `Prefix` is this toolkit's own; `Series` is what the canonical
// MedAR template ships, and every MedAR register was therefore read as declaring NOTHING - so
// the repos with the most carefully maintained registers looked exactly like the repos with
// none. Accept both rather than asking eight roadmaps to rename a column.
const headerAt = text.search(/^\|\s*Prefix\s*\|/im);
```

**The comment states the remedy. The regex implements half of it.** `Series` is never matched, so
the defect the comment describes in the past tense is still live.

That is the measurement `DOCS-48` already recorded without identifying the cause: *"`readSeries`
returns `declared=[]` for AIR, DevTools, HDCTranslators AND SX_Coder"* — **4 of 6 registers**, and
the reason is one missing alternation.

## The symmetry

```
lib/series.js    matches  | Prefix | ...          blind to Series-first    documented as accepting both
lib/migrate.js   matches  | Series | Last Num |   blind to Prefix-first    DOCS-55
```

**Each reader is blind to exactly the shape the other requires**, inside one tool, and neither
reports that it saw nothing. A register is therefore read as authoritative by one component and as
absent by the other, depending only on which word its first column uses.

## ⚠️ The fix is NOT "accept both" as written

Naively widening the regex would misfire. DevTools' table is:

```
| Series | Last Num | Series Description |
| DevTools | DT-092 | cictl build/stage/deploy ... |
```

Its first cell holds a series **name**, `DevTools` — not a prefix. Accepting `| Series |` blindly
would declare a prefix called `DevTools` that nothing owns and nothing mints. **So the two spellings
are not in fact one meaning**, which is what the comment asserts and what makes the one-line fix
look safe.

What is needed is a decision about what the first column MEANS in each template, which is `DOCS-32`
(one canonical register template) and `DOCS-42` (the registers disagree on shape). This slice
supplies the measurement those two were missing: it is not a parser preference, it is that **one of
the two templates puts a prefix in column one and the other puts a label there.**

Sequencing: `DOCS-55`'s fix — split `readSeries` into a text parser and a file wrapper so both
components ask one question — is still right and still first. This slice says what that one question
must be careful about.

## Also from the same review, and both real

- **`lib/tables.js:48`** — `checkTable` treats a row as a header only when its first cell is in a
  small allowlist (`ID`/`Series`/`Prefix`/…), so ordinary tables are never checked at all. Copilot's
  example: `| Surface | Role | … |` in `docs/design/one-thing-to-edit.md`. The command is documented
  as a general table-shape check and is not one.
- **`lib/migrate.js:188`** — `readSeries.fromText` is not defined anywhere, so the conditional is
  dead and advertises behaviour that does not exist. Independently found; already recorded in
  `DOCS-55`, and **two findings agreeing from different directions is the useful part**.
