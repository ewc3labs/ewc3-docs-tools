---
id: DOCS-077
state: 🟦 tested
title: "migrate-project: a tree whose history begins at its import cannot date evidence, and says so"
est: S
doc: "[DOCS-077](slices/DOCS-077_migrate_project_a_tree_whose_history_begins_at_its_import.md)"
status: ""
state_sha: 42564f5cf115
state_source: trailer
---

# DOCS-077 — migrate-project: a tree whose history begins at its import cannot date evidence, and says so

`DOCS-075` dates each evidence line against when its id was minted: the first commit that added the
id's row. A scratch tree built by exporting a repository and re-initialising it (`git archive`, then
`git init`) has **no history before that import**, and it is not a shallow clone, so the existing
"history unavailable" test passes and every id's row appears to have been minted on the day of the
import.

Both outcomes are wrong, and neither is visible:

- lines **with** a date written in them are all older than the import, so **every one** is set apart
  — mass false positives;
- lines **without** one are blamed to the import commit, so **nothing** is set apart, and a green
  run proves nothing.

A downstream chain hit this while proving DOCS-075 on a scratch tree.

## Fix

Refuse to date, rather than date from an artifact.

- `mintDates` records the first commit it walks. When that commit is a **root commit** (no parent)
  and **every** id's mint date is its date, the whole register arrived with the import, so the dates
  say nothing about minting.
- That is reported as the existing "dates not checked" case, with its own reason: nothing is set
  apart, `migrate-project` prints it, and each slice document's evidence section says so.
- A repository genuinely created in one commit reads the same way, correctly: its ids were not
  minted at different times, so no line can be shown to predate one.
- Unchanged: a tree with real history behind its register dates every line as it does now.

## Tests

- A tree whose register and STATUS arrive in one root commit, with a STATUS line dated earlier:
  nothing is set apart, and the document and the report both say the dates were not checked.
- The same tree with a second commit that adds a later row: dating resumes, because the register did
  not all arrive at once.
- A repository with real history is unaffected.
