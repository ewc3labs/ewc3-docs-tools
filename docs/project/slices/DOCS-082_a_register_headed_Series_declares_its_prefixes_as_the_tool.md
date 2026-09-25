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

## What a wider match let in, and the rules that keep it honest

Accepting `Series` creates candidates that did not exist before, and the first is this toolkit's own
output: `migrate-project` preserves the superseded register inside a `<details>` block — *kept
verbatim, nothing here was thrown away* — so a migrated roadmap carries a second, historical
register a few lines below its live one.

Measured before this shipped, with the archival table **above** the live one:

| order | declared |
| --- | --- |
| live register first | `HDC` — correct |
| archival register first | `OLD` — **a superseded prefix owned by someone else**, and the live register missed entirely |

So position decided which register was authoritative. Three rules fix that:

1. **An archive does not declare.** Nothing inside a `<details>` block declares a prefix.
2. **The canonical spelling wins.** Where both headers exist, `Prefix` is the live shape and
   `Series` is what a register carried before migration, so order never decides.
3. **A header alone is not a register**, under *either* word. A glossary headed
   `| Series | Meaning |` claimed every prefix in its first column and, sitting first, hid the real
   register beneath it. A register carries a scope, an owner or a counter; a glossary carries none.

   This rule was applied to `Series` alone at first, reasoning that `Prefix` is this toolkit's own
   word and needed no such test. **That exemption was argued, not measured, and it cost:** a
   `| Prefix | Meaning |` glossary then took precedence over a real register, declared its first
   cell, and carried no counter — so minting fell back to the rows and re-issued a recorded id. The
   test is symmetric now. An exemption argued from what a word *means* is not a measurement.

And one rule that is not about reading at all. **Accepting a shape means accepting its counter.**
The counter column was recognised only as `Last Used`, while the newly accepted shape spells it
`Last Num` — so a register whose counter said `AIR-28`, with `AIR-27` as its highest retained row,
minted **`AIR-28`**: a number its own counter had already recorded. A loud refusal had become a
silent collision. The counter is read under either name now, and `Next` is deliberately not read,
because it holds the id that has **not** been used.

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

- every register shape the toolkit supports, under both headings, declares its prefix with scope
  read the same way;
- the legacy name-keyed shape declares nothing, while the id in use is still seen;
- an archival register inside `<details>` declares nothing in **either** order, and an id that
  appears only inside it still sets the high-water mark;
- a glossary headed `| Series | Meaning |` **or** `| Prefix | Meaning |` declares nothing and does
  not hide the real register — checked through the reader *and* through `slice new`;
- a counter spelled `Last Num` is read, so an accepted shape cannot re-issue a recorded id;
- minting and the declaration reader choose the same register: an archived counter above a live one
  never picks the next id.

## The lesson, which is already in AGENTS.md

*A design note states intent; only the code knows what it does.* This one had the intent written
directly above the line that contradicted it, for four slices, and every reader since — including
me, twice this week — took the comment for the behaviour.
