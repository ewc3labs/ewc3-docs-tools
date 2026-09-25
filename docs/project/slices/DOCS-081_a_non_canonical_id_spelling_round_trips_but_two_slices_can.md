---
id: DOCS-081
state: ⬜ planned
title: a non-canonical id spelling round-trips, but two slices cannot share one number
est: M
doc: "[DOCS-081](slices/DOCS-081_a_non_canonical_id_spelling_round_trips_but_two_slices_can.md)"
status: ""
---

# DOCS-081 — a non-canonical id spelling round-trips, but two slices cannot share one number

A downstream register holds a **retired tombstone** whose id was mis-minted with a non-canonical
width — call it `XY-01` in a series that pads to three — alongside a **live** slice at `XY-001`. The
tombstone's row says, in the row itself, *do not re-spell this id*: it exists to resolve one commit
citation, and padding it would break the only thing it is for. The estate is also moving towards a
**display-only** Last Used cell, computed by tooling rather than declared. Two questions came with
it, and both are answerable from what the tool already does.

## The defect: a row that arrives second is lost, silently

Measured on shipped code, with the two rows and **no** slice documents yet — the real shape of a
register before conversion:

```text
migrate-project --write   exit 0
  wrote:  docs/project_v2/slices/  (2 documents from 3 rows and 0 narrative sections)
  staged: XY-001_mis_minted_cited_by_one_commit.md   XY-111_latest.md
```

One document for the two rows, named for the **canonical** spelling and titled from the **other**
row. The second row's state, title and prose went into no document at all, the run **succeeded**,
and the only tell was a count line that reads like success. `rows with no document` reported none,
because both rows resolve to the one surviving file.

Migration refused two **documents** for one id since `DOCS-062`, and never checked for two **rows**.

**Fixed here.** `migrate-project` refuses before anything is written, dry run included, naming each
row by line and by the spelling it carries:

```text
  REFUSED: 1 number(s) carried by more than one row. A number is one slice,
           so these rows would share one document and all but one would be lost:
    XY-1: docs/project/R_Roadmap.md:17 (XY-01)  docs/project/R_Roadmap.md:18 (XY-001)
  Keep one row per number - retire the other by recording its id as TEXT, outside the index.
```

Which row is the slice is a human decision. A migration advertised as non-destructive must not make
it by arriving second.

`index --check` already caught this — `DUPLICATE XY-1 on 2 rows`, naming both lines — so the gate on
an *adopted* register held. The hole was in the step that gets a register adopted.

## Measured, at the current main

**A non-canonical spelling already round-trips — as long as it is the only slice at that number.** A
register with `XY-01` at number 1 and `XY-111` as its highest:

| command | result |
| --- | --- |
| `index --check` | exit 0 |
| `index --write` | the row is rewritten as `\| XY-01 \|`, the spelling untouched — the id comes from the document's frontmatter, verbatim |
| `values` | never re-spells a row id; it substitutes marked spans only |
| `slice new XY` | `XY-112`, from the highest number, unaffected by the odd spelling |

Nothing in that path pads an existing id. Filenames are not derived for a document that already
exists: `index` never renames, and migration copies an authored document byte-for-byte.

**Two slices at one number is refused, loudly.** With both `XY-01` and `XY-001` carrying documents:

```text
index --check    exit 2    XY-1: XY-001_live.md  XY-01_tombstone.md
                           Two documents cannot own one id. Resolve it before rendering.
migrate-project  exit 1    REFUSED: 1 slice(s) with more than one document.
```

## The answer, plainly

**The number is the identity. The spelling is a display detail.** `XY-4`, `XY-004` and `XY-00004`
are one slice — that is `DOCS-062`, and it is the rule that catches a number claimed twice across an
estate. So the tool **cannot** carry a tombstone and a live slice as two different slices at number
1, and it should not learn to: a model where a number identifies a slice *except when the spelling
differs* cannot answer "is this number taken?", which is the only question a register exists to
answer.

What it *can* do, and already does, is carry **one** slice at that number with its spelling exactly
as issued.

So the tombstone needs to stop being a second slice at number 1. Options, in the order I would take
them:

1. **A withdrawn-numbers table**, passed through verbatim and never derived from: the id appears as
   **text** in a row of its own table, not as a first-cell id in the Delivery Index. The citation
   still resolves by reading it; nothing mints it; no document owns it; the number belongs to the
   live slice. This preserves the artifact, which is the row's whole function.
2. **A note on the live slice's document**: the live `XY-001` document records that `XY-01` was
   issued, withdrawn, and cites commit `<sha>`. One document, one number, the citation resolvable.
3. **Teach the model a named exception.** I would not: see above.

## The padding declaration keeps its home

The ruling that a padding minimum is **declared, never derived** does not need a new surface. It
already lives in repository config, where a generated document cannot overwrite it:

```json
{ "series": { "widths": { "XY": 3 } } }
```

`series.widths` is read by `slice new`, by migration and by the `lastId` resolver, and a
**declared** width beats a detected one everywhere — that is why it exists. A generated Last Used
cell is an output; the width is an input; they were already separate.

## A document count is not the invariant

A downstream suggestion was to gate the cutover on `documents emitted == register rows`. That one
would false-alarm here: **one document may serve several rows on purpose** — a narrative heading
covering `XY-371 through XY-375` becomes one document for five rows, which is the whole reason
groups exist. The invariant that holds is the one implemented above: **no two rows share a number,
and every row's number is represented by exactly one document.**

The second suggested gate — every row's id byte-identical to its document's id — is what
`index --check` already does by comparing the whole rendered row, and the id is rendered from
frontmatter verbatim.

## Uniqueness is asserted in number space

It is, and the string-space check is exactly what missed the collision downstream: comparing ids as
strings reported 113 ids across 112 positions with no duplicates, which is arithmetically
impossible. Every check here normalises first (`normalizeId`), which is how the pair was caught.

## Tests

Regression fixtures, so the contract above cannot drift:

- a lone non-canonical id: `index --check` 0, `index --write` preserves the spelling, `slice new`
  computes from the number, `values` leaves the row alone;
- both spellings of one number **as documents**: `index --check` exits 2 and `migrate-project`
  refuses, each naming both documents;
- both spellings of one number **as rows, with no documents yet** — the shape that lost a row:
  `migrate-project --write` exits 1, names each row by line and spelling, and stages nothing;
- a declared width does not re-spell an existing narrow id anywhere.

## Not decided here

The **display-only, tool-emitted Last Used cell** is a change to what a register *is*, and it
reached me relayed through two sessions. It is written down here so it is not lost, and it is for
Wilson to confirm before anything is built:

- computing the high-water mark from **filenames** is weaker than from frontmatter: a renamed file
  loses its id, and frontmatter is the declaration (`DOCS-066`). The existing computation already
  reads frontmatter first and falls back to the filename, and also consults rows, the Last Used cell
  and the archive. **Narrowing it to filenames would lose evidence, not gain any.**
- a register that no longer *declares* its last number can still be checked, because the cell is
  derived and marked — that part is `DOCS-010` and works today.
