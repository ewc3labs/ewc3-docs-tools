---
id: DOCS-082
state: 🟦 tested
title: a register headed Series declares its prefixes, as the toolkit has always claimed
est: S
doc: "[DOCS-082](slices/DOCS-082_a_register_headed_Series_declares_its_prefixes_as_the_tool.md)"
status: ""
state_sha: 9a692d5be3d6
state_source: trailer
---

# DOCS-082 — a register headed Series declares its prefixes, as the toolkit has always claimed

The reader that decides which prefixes a register **owns** matched a header spelled `Prefix`, and
only that. A register headed `Series` — the same table, the same columns, one word different —
declared **nothing**.

The comment directly above that line has said otherwise since `DOCS-058`:

> Two spellings, one meaning. `Prefix` is this toolkit's own; `Series` is what the canonical
> template ships, and every register was therefore read as declaring NOTHING — so the repos with
> the most carefully maintained registers looked exactly like the repos with none. Accept both
> rather than asking eight roadmaps to rename a column.

The comment describes the fix. The regex never had it.

## What it cost, measured

A repository whose register is headed `Series`, with `AIR` declared global and `AIR-28` in use:

| | before | after |
| --- | --- | --- |
| `series` | **exit 1** — `AIR up to AIR-28`, reported as undeclared | exit 0 — `AIR global, last used: AIR-28` |
| `slice new AIR` | **exit 1** — *"AIR is not declared by any register in this repository"* | `AIR-29` |

So the repositories keeping the template's own header could not mint, and their own prefixes read as
undeclared. A downstream sweep of 41 repositories found **two of the four register shapes in use are
headed `Series`**.

It also matters for anything derived across repositories: a register that declares nothing does not
look wrong, it looks **empty**, so an ownership table generated from these registers would have
under-reported silently rather than failed.

## The fix, and the guard that makes it safe

The header match accepts `Prefix` or `Series`. Nothing else changes: the **first cell must still
look like a prefix**, so the legacy shape keyed by a human name —

```text
| Series | Last used | Next |
| Vertical Slices | VS-390 | VS-391 |
```

— still declares nothing, because `Vertical Slices` is not a prefix. That register's series is
visible only inside `DT-110`, which is a `migrate-project` problem, not an ownership claim.

`migrate-project`'s own canonical-shape test still keys on `Prefix` deliberately: it answers "is
this register already in the canonical shape?", and a `Series`-headed table is not. It reshapes it,
as it should.

## Tests

- all four register shapes measured downstream — two headed `Prefix`, two headed `Series` — declare
  their prefix, with scope read the same way;
- the legacy name-keyed shape declares nothing, while the id in use is still seen.

## The lesson, which is already in AGENTS.md

*A design note states intent; only the code knows what it does.* This one had the intent written
directly above the line that contradicted it, for four slices, and every reader since — including
me, twice this week — took the comment for the behaviour.
