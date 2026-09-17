---
id: DOCS-062
state: 🟦 tested
title: '`migrate-project` regenerates over slice documents that predate frontmatter, and adoption deletes the kept ones'
est: M
doc: '[DOCS-062](slices/DOCS-062_Migration_regenerates_over_older_slice_documents.md)'
status: 'every existing document is inventoried and staged byte-for-byte (kept, or backed up to _legacy/ and linked); ids match padding-insensitively; unit-tested, not yet run on a MedAR repo'
priority: high
lane: migrate
---

# DOCS-062 — Migration regenerates over older slice documents

`DOCS-054` stopped migration regenerating a slice document a human had written. It recognised such a
document **only by an exact frontmatter `id:`**. The MedAR repos about to migrate have slice
documents that predate frontmatter, and for every one of them that protection did nothing.

## Measured, 2026-09-17, on a scratch repo with five existing documents

| existing document | what migration did | what adoption did |
| --- | --- | --- |
| no frontmatter, same filename the generator picks | generated a document under the **same name** | **overwrote the prose** |
| frontmatter with no `id:` | generated a second document under a new name | two documents for one id; the prose unlinked |
| unreadable frontmatter | the same; the parse error was swallowed | the same |
| `id: VS-004` for row `VS-4` | the same; the id match was exact, not padding-insensitive | the same |
| proper frontmatter | kept, `kept: 1 authored document(s)` | **deleted.** Kept documents were never staged, and the generated README says to adopt by *replacing* `docs/project/` |

None of the first four was reported. The output said "kept 1" and nothing else, which reads like a
clean run.

The unreadable case had been a deliberate choice. A comment in the scan said a document too
malformed to read *"is left alone AND not counted as covering"* its row. That was true of the live
file and false of the outcome: the row got a generated document, and the adoption step then replaced
the live one.

## Fix — inventory everything, overwrite nothing (Wilson, 2026-09-17)

- **Ids match padding-insensitively everywhere.** `VS-4`, `VS-004` and `VS-00004` are one slice
  (`normalizeId`). That covers migration's match on existing documents and `index`'s
  duplicate-document refusal.
- **Every existing document is inventoried** before anything is written, dry run included: its id,
  where the id came from, its frontmatter state, and what happens to it. When frontmatter has no
  usable `id:`, the filename's leading id is used, because an older document still carries its slice
  in its name.
- **With usable frontmatter: kept**, and copied byte-for-byte into the staged tree.
- **Without usable frontmatter: backed up** byte-for-byte to `docs/project_v2/slices/_legacy/`. A
  document is generated for its slice, and it links to the backup with a warning that the prose was
  **not merged**. Which of those words still hold is judgement, and a merge that guesses reads like
  a decision nobody made.
- **Two existing documents for one slice** (padding included) **refuse the migration**, naming both,
  before anything is written. Which one is the slice is not a tool decision.
- **The staged tree is complete.** Adopting `docs/project_v2/` in one move now loses nothing a human
  wrote. A test pins this: every live document must appear byte-for-byte somewhere in staging.

## Not built

- **Merging a legacy document's prose into the generated one.** Deliberately left as a manual step.
- **Documents outside `docs/project/slices`**, such as design notes elsewhere that describe a slice,
  are not inventoried.
- **Not yet run on a MedAR repo.** The next evidence is a dry run of `migrate-project` against one
  of them, reading the inventory before `--write`.
