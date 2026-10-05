---
id: DOCS-087
state: ⬜ planned
title: a converted register's Last Used is emitted by the tool, from slice documents and the archive
est: M
doc: "[DOCS-087](slices/DOCS-087_a_converted_register_s_Last_Used_is_emitted_by_the_tool_fr.md)"
status: ""
---

# DOCS-087 — a converted register's Last Used is emitted by the tool, from slice documents and the archive

Decided as `W-2` (2026-10-05): **yes**, derived from slice documents **and** the archive.

This repository already works this way: its Last Used cells are `<!--ewc3:lastDOCS-->` markers that
`values` derives and CI checks. A converted register still declares its number by hand, so it can
fall behind and hand out a number that is already spent. This slice makes conversion produce the
derived form.

## What the derivation must read

- **Slice documents**, by frontmatter `id` with the filename as fallback — a renamed file must not
  lose its number.
- **`docs/_ARCHIVE`.** From `slices/` alone, an archived number is minted again. Measured: with
  `XY-002` live and `XY-007` archived, `slices/` alone would mint `XY-003`; reading the archive
  mints `XY-008`.
- **Rows still in the register** during a re-charter, which run ahead of the documents until the
  hub's outstanding rows are mirrored.

## What stays declared

The **padding width** is an input, not an output: it stays in `series.widths`, where a generated
cell cannot overwrite it. A generated Last Used is the output; the width it is written at is not
derived from it.

## Done when

`migrate-project` emits the Last Used cell as a derived marker with the matching `values` entry, a
converted register's `values --check` fails when the number goes stale, and the next mint after
conversion never reissues an archived number.
