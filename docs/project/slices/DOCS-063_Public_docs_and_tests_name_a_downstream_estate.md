---
id: DOCS-063
state: ⬜ planned
title: 'Public docs, comments and tests still name a downstream estate'
est: M
doc: '[DOCS-063](slices/DOCS-063_Public_docs_and_tests_name_a_downstream_estate.md)'
status: ''
priority: high
lane: hygiene
---

# DOCS-063 — Public docs, comments and tests still name a downstream estate

This repository is **public**, and it is a generic tool. The estate that uses it is downstream, and
its specifics are not this repository's to publish (ruling relayed by LabsHQ, 2026-09-17).

## The rule

No downstream organisation, repository or local path names, no internal object names, and no
measurements taken on downstream repositories go into code, tests, docs, PR bodies or commit
messages. **Keep the lesson, drop the name.** "A 57-repository downstream estate had 33 older slice
documents" carries everything the tool needs. A fixture id prefix such as `VS-` is not a company,
and is fine.

## Existing debt on `main`

Measured 2026-09-17 by LabsHQ: roughly 360 lines across 30 files, in design docs, slice documents,
`lib/` comments and `test/run.js`. By kind:

- relative links into sibling repositories of that estate, including to a data-handling document;
- absolute local paths on a developer machine;
- an internal database object name used as a test fixture;
- organisation and repository names used as examples, including in `DOCS-051` and `lib/links.js`.

## Fix — forward only

- **Generalise each line forward** in ordinary commits, keeping what it teaches.
- **Never rewrite `main`'s history.** The repository is already published; a rewrite breaks every
  clone and unpublishes nothing.
- **Acceptance lives downstream.** A public denylist would publish the very names it forbids, so the
  check that no name remains runs from the estate's side, against this repository.

PRs #6 and #7 were generalised before merging and squash-merged, so neither adds to this debt.
