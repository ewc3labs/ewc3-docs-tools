---
id: DOCS-074
state: ⬜ planned
title: "fold: a State Legend it cannot fully read does not run, rather than folding against a partial legend"
est: S
doc: "[DOCS-074](slices/DOCS-074_fold_a_State_Legend_it_cannot_fully_read_does_not_run_rath.md)"
status: ""
---

# DOCS-074 — fold: a State Legend it cannot fully read does not run, rather than folding against a partial legend

Two downstream conversions found the same defect independently. A register's `State Legend` that
`fold` cannot fully read is treated as **absent** or read **partially**, with no warning. Every
trailer word the parser dropped is then refused as "not in the legend", which reads as the trailer's
fault and shows up as exit 1, like a stale document.

## Measured

A probe calling `legendOf` and `resolveState` with `State: coded`:

| legend shape | words read | `coded` resolves to |
| --- | --- | --- |
| `## State Legend`, one `` - ⬜ `planned` — … `` bullet per state (canonical) | planned, coded, … | `🟦 coded` |
| `## State Legend`, **one** bullet `` - ⬜ `planned` · 🟦 `coded` · 💨 `smoked` `` | planned | error "not in the legend": **silently partial** |
| `### State Legend`, canonical bullets | none | error "the register has no State Legend": **false** |
| `### State Legend`, one unbackticked line `⬜ planned · 🟦 coded …` | none | the same false message |

## Cause

- `section()` in `lib/slices.js` matches only a `## ` heading, so a `###` legend is not found.
- `legendOf()` in `lib/fold.js` takes the **first** backticked word of each bullet and silently
  skips any line it cannot match.

## Fix

**Refuse; don't parse harder.** The one-line `·` form is not accepted. Each extra accepted shape is
another place for the parser and the author to disagree, and the canonical form is one line per
state. What changes is that a legend the parser can't read says so, instead of shrinking.

- Find `State Legend` at **any** heading level, `##` to `######`. The section runs to the next
  heading of the same or a higher level. This lookup belongs to the legend only; the shared
  `section()` used for the Delivery Index keeps its `##` rule.
- A found legend is **unreadable** when:
  - a bullet that isn't an `_italic_` note carries **no** backticked word, or **more than one**;
  - a non-bullet line in the section lists states (`·` separators between words); or
  - the section yields **zero** states.
- An unreadable legend means `fold` **did not run: exit 2**, in every mode. It names the file and
  line and shows the expected shape:

  ```text
  fold: did not run: the State Legend at docs/project/R_Roadmap.md:12 could not be read:
    - ⬜ `planned` · 🟦 `coded` · 💨 `smoked`
  expected one "- <glyph> `word` — meaning" per bullet
  ```

  A legend defect is a register defect, not a stale document, so CI must not report it as exit 1.
- `fold --check-message` (DOCS-073) uses the same reader and the same exit 2.
- Unchanged: with **no** `State Legend` heading at all, words take the spellings the register
  already uses. A rows register or no register is still a no-op (exit 0) before any legend is read.

## Tests

The three failing rows above as fixtures:

- one bullet listing three states → exit 2 naming the line, in dry run, `--write` and `--check`;
  nothing is written;
- `### State Legend` with canonical bullets → read; `State: coded` folds to `🟦 coded`;
- `### State Legend` as one unbackticked `·` line → exit 2 naming the line;
- an `_italic_` reserved-word note bullet is still skipped, not reported;
- no legend heading → the spellings fallback, unchanged.
