---
id: DOCS-062
state: 🟦 tested
title: '`migrate-project` regenerates over slice documents that predate frontmatter, and adoption deletes the kept ones'
est: M
doc: '[DOCS-062](slices/DOCS-062_Migration_regenerates_over_older_slice_documents.md)'
status: 'every existing document is inventoried and staged byte-for-byte; ids match padding-insensitively; unit-tested, and a read-only census of all 57 MedAR repos found 33 older documents, 31 of them in MedFM_Docs, which migration cannot reach'
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
- **A kept document's filename is reserved.** When another row would generate that exact name, the
  generated document is renamed with a `_generated` suffix. The authored one is never replaced.
  Found by Codex on PR #7: a doc named `VS-2_...md` declaring `VS-5` replaced VS-2's generated
  document, and both rows pointed at one file.
- **The staged tree is complete.** Adopting `docs/project_v2/` in one move now loses nothing a human
  wrote. A test pins this: every live document must appear byte-for-byte somewhere in staging.

## Estate census (PMO, 2026-09-17, read-only)

PMO ran the instrument at `8cd637c` without `--write` on committed exports. It covered all 56
MedARMS org repos plus local-only PHPHDCTranslators, with paths taken from the GitHub tree API;
where the instrument could not reach, a script using this tool's own `frontmatter.js` classified by
hand. Full table with SHAs: `OneDrive scratch/docs-062-slice-census/RESULTS.md`.

| repo | older slice documents | reachable by migration |
| --- | --- | --- |
| SX_DW | 2, no frontmatter, plus a slices README | yes |
| MedFM_Docs | 31, no frontmatter | **no** |
| SX_Coder, DevTools, MedAR_AI_Runtime | 0, plus a slices README each | yes |
| the other 52 | 0, and no slice-like paths | nothing to reach |

**The blast radius of the original defect was small.** The only reachable documents it would have
regenerated over were SX_DW's two. Two things the census found are fixed here:

- **A slices folder's `README.md` went to `_legacy/`** in all four repos that have one, so adoption
  would have taken it out of `slices/`. A file with no id in its frontmatter *or* its filename is
  not a slice document; it is now copied verbatim to where it was.
- **The inventory printed the normalised id** (`DW-12`) where the filename, row and frontmatter all
  say `DW-012`, so a grep for `DW-012` missed the line. It now prints the id as written. Matching is
  unchanged.

## Open, for Wilson

- **MedFM_Docs cannot migrate at all**, for two independent reasons. Its planning surface lives at
  `project/`, not `docs/project/`. And its roadmap is numbered lists under phase headings, with no
  Delivery Index, so even a relocated copy returns before the inventory. Its 31 documents are safe
  from this defect for the same reason. Migrating it would be a different template, not a fix here.
- **MedFM_Docs has several documents per id:** `MAN-001` has 2 and `MAN-002` has 3. The shape looks
  deliberate: one slice, several deliverables. Migration refuses exactly this shape, because the
  slice-document model is one document declaring each id. Either those deliverables become
  sub-slices or non-declaring attachments, or the model allows them.

## Not built

- **Merging a legacy document's prose into the generated one.** Deliberately left as a manual step.
- **Documents outside `docs/project/slices`.** The census found none in any reachable repo, and its
  "slice-like" search sees only a folder named `slices` or a file named `PREFIX-digits...`.
- **No `--write` on a real repo yet**, beyond PMO's test `--write` on a scratch copy of the SX_DW
  export.
