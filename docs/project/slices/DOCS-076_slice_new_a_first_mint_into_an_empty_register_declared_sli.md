---
id: DOCS-076
state: ⬜ planned
title: "slice new: a first mint into an empty register declared slice-documents creates slices/"
est: S
doc: "[DOCS-076](slices/DOCS-076_slice_new_a_first_mint_into_an_empty_register_declared_sli.md)"
status: ""
---

# DOCS-076 — slice new: a first mint into an empty register declared slice-documents creates slices/

A new repository bootstrapping an **empty** register can't mint its first slice. `slice new` refuses
when `docs/project/slices/` doesn't exist ("migrate first"), but a register with no rows has nothing
to migrate. The workaround downstream is to write a placeholder `slices/README.md` just to make the
folder exist.

The refusal is right in general: a repository that keeps its register as rows has no `slices/`, and
`slice new` must not quietly turn it into a slice-document repository. What's missing is a way to
say that this repository *is* one, before its first document exists.

## Fix

The `planning` config key (DOCS-036/038) already declares exactly this.

- `planning: "slice-documents"` declared and no `slices/`: `slice new --write` creates
  `docs/project/slices/` and mints into it. The dry run says it will create the folder.
- No declaration and no `slices/`: still refused, exit 2. The message names both ways forward:
  `migrate-project` for a register with rows, or declaring `planning: "slice-documents"` for a new,
  empty one.
- `planning: "roadmap-rows"` declared: refused, as now.
- Unchanged for a first row: `--table` is required when the prefix has no table yet, and `--state`
  when no row says "planned". The refusals already name both. The dry run for an empty register
  should show a complete example command, so the first mint takes one try.
- `fold`: with `planning: "slice-documents"` declared and no `slices/`, `fold` currently does not
  run (exit 2). After the first mint the folder exists, so nothing changes there. Only `slice new`
  creates the folder.

## Tests

- Empty register, `planning: "slice-documents"`, no `slices/`: `slice new --write` exits 0, creates
  the folder and the document, and `index --check` and `fold --check` exit 0 afterwards.
- The same repository with no declaration: exit 2, and the message names `planning` and
  `migrate-project`; nothing is created.
- `planning: "roadmap-rows"`: refused; nothing is created.
