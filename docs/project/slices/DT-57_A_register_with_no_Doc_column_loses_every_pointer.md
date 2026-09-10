---
id: DT-57
state: ⬜ planned
title: 'A register with no Doc column loses every pointer to its slices, and any warning its rows carried'
est: M
doc: slices/DT-57_A_register_with_no_Doc_column_loses_every_pointer.md
status: 'BLOCKS DevTools adoption: their header has no Doc column, so after `index --write` every row renders with an empty Status and no link at all - including the row whose entire purpose is a DO-NOT-RE-SPELL warning'
priority: high
lane: index
---

# DT-57 — A register with no `Doc` column loses every pointer to its slices

`DT-53` moved the slice pointer out of the Status cell and into `Doc`, on the reasoning that `Doc`
is the column that means it. **That reasoning assumed every register has one.** DevTools does not.

## Measured against the real DevTools shape, reported by DT

Their Delivery Index header is `| ID | State | Slice | Est | Priority | Lane | Status |` — seven
columns, no `Doc`. (My first fixture used five; DT corrected it. The conclusion is unchanged —
there is still no `Doc` column — but the worked example now reproduces against their real file.)
Run the documented sequence on it:

```
migrate-project --write   row -> | DT-01 | ⬜ planned | Mis-minted... | S | See [slice notes](...) |
index --write             row -> | DT-01 | ⬜ planned | Mis-minted... | S |  |
```

`data.doc` is still set, but nothing renders it: `renderRow` maps frontmatter keys onto **the
headings the register actually has**, so a field with no column is dropped. The pointer exists in
the document and is unreachable from the index.

> **The register becomes a list of titles with no way back to the documents that own them** — the
> opposite of the greppable index the migration is for.

## The instance that shows why it is not cosmetic

DT's register carries `DT-01`: two digits in a series that otherwise pads to three. It is not a
DevTools mint — it came from a stale duplicate register elsewhere — and it survives **only** so a
citation in `config/STATUS.yaml` resolves. Its row body carries an explicit
`⛔ DO NOT RE-SPELL THIS ID` clause, put there deliberately under the rule that **a record which
looks like a defect must carry its own reason IN ITSELF**, because the person who normalises it
will not be reading commit messages or design docs.

Traced through the sequence:

```
clause in the slice body        1
clause in the register         0
DT-01 re-padded to DT-001      NO  - the id itself is safe
```

**The id survives and the reason it survives does not.** The warning was authored into the exact
surface where the dangerous edit happens, and migration relocates it one hop away — then
`index --write` removes even the pointer to that hop. **A mitigation written correctly, defeated by
a tool that moved the surface out from under it.** Same shape as `DT-56`, one level up: not
deletion, relocation, with nothing left behind to say where it went.

## Fix

1. **`index` must not silently drop a frontmatter field that has no column.** A document declaring
   `doc:` in a register with no `Doc` column is a mismatch worth naming, not ignoring — `DT-27`’s
   refuse-don’t-drop, applied to columns.
2. **Where no `Doc` column exists, the pointer belongs in the last cell**, which is where
   `migrate-project` already puts `See [slice notes](...)`. `DT-53` emptied that cell to stop the
   narrative regenerating; emptying it is right for a paragraph and wrong for a pointer.
   Distinguish the two rather than blanking the cell.
3. **Or `index --write` offers to add a `Doc` column** when a register lacks one and its documents
   declare `doc:`. A column added once is better than a pointer lost every run.

⛔ **DevTools should not adopt until this lands.** Their register would come out navigable-looking
and unnavigable, and the one row in it that most needs its explanation would lose it.

## What is NOT wrong for DevTools, verified

- `REGISTER_HEADER` **matches** their `| Series | Last Num |` table exactly once, so
  `migrate-project` takes the UPDATE path — `DT-55`’s duplicate-register trap cannot fire there.
- They have **no `## ID Prefixes` table**, so there is only one prefix-declaring surface anyway.
- `DT-01` is **not re-padded** by the migration; the id is spelled through unchanged.

Their Series column has no Owner, so a migration would still reshape that table — worth their
review before running it, but it is a reshape rather than a duplication.

## The twin, confirmed by measurement — a column with no field

DT raised the mirror of this slice: *a frontmatter field with no column is silently dropped* **and**
*a column with no frontmatter field is silently blanked.* Both are real, and the scope needed one
correction:

```
migrated document      priority: Medium / lane: Publish safety   CARRIED, and renders back
hand-authored document without those fields:
  | DT-90 | ⬜ planned | A normal three-digit row | S |  |  |  |     <- Priority and Lane BLANK
```

So migration does **not** lose DevTools’ 92 rows of triage data — `migrate-project` carries every
non-id column into frontmatter, exactly as its comment claims. The twin bites the **hand-authored**
document instead: anyone writing a slice by hand omits fields they never knew were columns, and the
register silently blanks that row’s Priority and Lane on the next render.

> **The mapping is total in neither direction and reports in neither.** A projection that silently
> accepts a mismatch either way is not a projection — it is a lossy copy that looks authoritative.

DT’s doctrine fix, which costs nothing because both sides are already computed at that moment:
**`index --write` should REPORT a cell it is about to overwrite that differs from what it will
write** — *"the Status cell for DT-01 was edited by hand; that edit is being DISCARDED. It belongs
in docs/project/slices/<id>.md."* Not refuse, report. **The sensor exists; only the alarm is
missing.** That also makes the summarizer safe: it writes the document, and if anyone wires it to
the register instead, the next run says so rather than eating it.
