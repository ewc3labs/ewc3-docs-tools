---
id: DOCS-065
state: 🟦 tested
title: '`migrate-project` and `index` disagree about every row of the register migrate writes, and the moved prose breaks links'
est: M
doc: '[DOCS-065](slices/DOCS-065_Migrate_and_index_disagree_about_the_register.md)'
status: 'migrate renders its register with index''s own renderer; every row''s Status moves to its body; moved links are repointed and evidence is quoted; unit-tested end to end on both register shapes, awaiting a downstream re-run'
priority: high
lane: migrate
---

# DOCS-065 — Migrate and index disagree about the register migrate writes

A downstream cutover rehearsal stopped at `cf88da5`. It migrated a real register, adopted the staged
tree, ran `index --check` and `links`, and got two defects:

1. **Every row diverged, at the same commit.** Migrate rewrote each row by hand and put a pointer
   (`See [slice notes](slices/<doc>.md).`) in the last cell. `index` rendered that cell from the
   document's frontmatter, which was either **empty**, so the adopted table lost every link to its
   documents, or, for **group followers**, still the **whole old Status paragraph**, because only an
   anchor's Status had been moved into its body.
2. **Moved prose broke links.** Recorded-evidence lines like `[VS-1][FIX-9] ...` parse as reference
   links to undefined labels. Relative targets moved one directory down were not repointed, and the
   definition rebase only handled targets starting with `./` or `../`, not a bare sibling name.

Nothing asserted that `index --check` passes on migrate's own output. Both commands were tested
separately, and each was right about itself.

## Fix — the contract the downstream consumer asked for

- **One renderer.** Migrate now finishes by rendering its register through `renderIndex`, over the
  documents it is staging: generated ones, and kept ones as they are. `index --check` agrees with it
  by construction.
- **A register with no Doc column points from its last cell.** When a document's value there is
  empty, `index` renders `pointerCell(file)`, the same function migrate uses. Registers with a Doc
  column are unchanged.
- **Every row's Status moves to its own document's body**, anchor or follower, and the frontmatter
  field is left empty for the summarizer. Nothing is decided by counting sentences: a one-line
  status moves too.
- **Moved text is repointed** (`rebaseRelative`): inline links, images and reference definitions,
  including bare sibling names. Fenced code and code spans are left alone.
- **Evidence is quoted** (`quoteEvidence`): brackets, and a `(` straight after one, are escaped, so
  a line renders as the same characters and no checker reads it as a link.

The downstream re-run at `c5e8130` passed `index --check` with 0 divergent rows, and found the rest:

- **A link whose text is a code span was not repointed** (`[\`docs/x.md\`](../x.md)`). The code-span
  guard split the line before links were matched and hid the target too. Links are now matched on
  the whole line, and one is skipped only when it starts inside a code span (`codeSpans`, which
  closes a run of N backticks only at a run of exactly N).
- **A GitHub twin that moved into frontmatter** stopped pairing with its relative link in the body.
  `links` now collects twins from frontmatter too; frontmatter is still never link-checked.

And Codex on PR #8:

- **An empty Doc cell links to its document** (`sliceHref`). A kept document with valid frontmatter
  but no `doc:` otherwise rendered unreachable after adoption.
- **Filenames are percent-encoded** in pointers and Doc links, so a space or parenthesis cannot
  split a destination. `links` decodes relative targets.

## Tests

End to end, on both register shapes (with and without a Doc column): migrate, adopt the staged tree,
then assert that **`index --check` exits 0** and that **`links` reports exactly the problems it
reported before**. Separately, every member's Status is in its body with an empty `status:`, and a
register with no Doc column links every row to its document.

## Not built

- **`_legacy/` backups keep their relative links unrepointed.** They are byte-for-byte by design;
  recorded in `DOCS-064`.
- **Evidence gathered from status files is still quoted, not interpreted.** A line that means "done"
  is recorded, never judged.
