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
undeclared. Registers headed `Series` are in live use downstream, in more than one shape.

It also matters for anything derived across repositories: a register that declares nothing does not
look wrong, it looks **empty**, so an ownership table generated from these registers would have
under-reported silently rather than failed.

## What a wider match let in, and the two rules that keep it honest

Accepting creates candidates that did not exist before, and the first one is this toolkit's own
output. preserves the superseded register inside a block — *kept verbatim, nothing here was thrown
away* — so a migrated roadmap contains a second, historical register a few lines below its live one.

Measured before this shipped, with the archival table **above** the live one:

| | declared |
| --- | --- |
| live register first |  — correct |
| archival register first |  — **a superseded prefix owned by someone else**, and the live register missed entirely |

So position decided which register was authoritative. Two rules fix that:

1. **An archive does not declare.** Nothing inside a block declares a prefix.
2. **The canonical spelling wins.** Where both headers exist, is the live shape and is what a
   register carried before migration, so order never decides.

**Ids in use are still read from the whole document**, archive included: a number that was used is
used, and hiding one would let the next mint reuse it. Measured — an id that appears *only* inside
the collapsed block still sets the high-water mark, while the block declares nothing.

The header match accepts `Prefix` or `Series`. Nothing else changes: the **first cell must still
look like a prefix**, so the legacy shape keyed by a human name —

```text
| Series | Last used | Next |
| Vertical Slices | VS-390 | VS-391 |
```

— still declares nothing, because `Vertical Slices` is not a prefix. That register's series is
visible only inside `VS-390`, which is a `migrate-project` problem, not an ownership claim.

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
