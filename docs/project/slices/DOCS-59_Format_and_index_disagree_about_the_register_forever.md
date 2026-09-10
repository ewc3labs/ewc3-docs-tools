---
id: DOCS-59
state: ⬜ planned
title: '`format` and `index --write` disagree about the register, stably and forever'
est: S
doc: '[DOCS-59](slices/DOCS-59_Format_and_index_disagree_about_the_register_forever.md)'
status: 'each undoes the other on every run, so whether `check` passes depends on which command ran last - measured stable across three rounds'
priority: high
lane: index
---

# DOCS-59 — `format` and `index --write` disagree about the register

Once the Delivery Index is generated, two tools both claim its table and render it differently.

## Measured, three rounds, stable

```
round 1: after format unformatted=0, after index --write unformatted=1
round 2: after format unformatted=0, after index --write unformatted=1
round 3: after format unformatted=0, after index --write unformatted=1
```

`format` aligns the table its way; `index --write` re-renders rows with `detectAlignment` and
`padCells` and produces something `format` then wants to change back. Neither converges.

**So `check` passing is a function of which command ran last**, which is the property a checker must
never have. `fix` then `check` is green; `index --write` then `check` is red, on an unchanged
register with no authoring in between.

This is the hazard `markedLines` was written to prevent, arriving between two different tools rather
than inside one: *"the two tools would undo each other forever, each reporting the file as
unformatted."* The comment predicted it; the case it predicted is now live.

## Fix

**One renderer owns the table.** Either `index` produces exactly what `format` would, or `format`
treats a generated Delivery Index as a marked region and leaves it alone. The second is cheaper and
matches the existing mechanism — a generated table is not prose, and `markedLines` already exists to
say so.

Until then the committed state must be **format-last**, which is what CI checks. Anyone running
`index --write` immediately before `check` will see a red tree and no explanation.
