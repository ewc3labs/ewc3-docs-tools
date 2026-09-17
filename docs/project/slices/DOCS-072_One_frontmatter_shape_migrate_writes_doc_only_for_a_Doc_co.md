---
id: DOCS-072
state: ⬜ planned
title: "One frontmatter shape: migrate writes doc only for a Doc column, and no source"
est: S
doc: "[DOCS-072](slices/DOCS-072_One_frontmatter_shape_migrate_writes_doc_only_for_a_Doc_co.md)"
status: ""
---

# DOCS-072 — One frontmatter shape: migrate writes doc only for a Doc column, and no source

A converted register carries two frontmatter shapes. Documents written by `migrate-project` have
`doc:` and `source:`; documents minted later by `slice new` have neither when the register has no
Doc column. `index --check` accepts both, so nothing fails, but "the slice doc is the object" needs
one shape.

## What each key does

- **`doc:`** is rendered only into a **Doc column** (`lib/deliveryindex.js`). With no Doc column,
  `index` builds the pointer from the document's filename, so the key is never read. `slice new`
  already writes it exactly when the column exists.
- **`source:`** is read by nothing. The generated body already names the source roadmap ("Generated
  by `ewc3-docs migrate-project` from …"), which is where a reader looks.

## Fix

`slice new`'s shape is canonical: the register's columns plus `id`, `state` and `title`. Then fold's
`state_sha`/`state_source` are added on top.

- `migrate-project` writes `doc:` only when the register has a Doc column, and stops writing
  `source:`. An authored Doc value is still never replaced.
- Documents already converted are left alone. Both extra keys are inert, and rewriting adopted
  documents to remove them is churn with no reader. A repository that wants one shape can delete the
  two lines by hand; `index --check` stays clean either way.

## Tests

- Migrating a register **without** a Doc column: no generated document has `doc:` or `source:`, and
  `index --check` exits 0 after adoption.
- Migrating a register **with** a Doc column: `doc:` is written as now, and no `source:`.
- A document migrated then a document minted by `slice new` in the same register have the same set
  of keys.
