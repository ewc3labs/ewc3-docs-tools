---
id: DOCS-091
state: 🟦 tested
title: "fold --commits-from --backfill: a repository's history is swept once, its old mistakes are warnings"
est: S
doc: "[DOCS-091](slices/DOCS-091_fold_commits_from_backfill_a_repository_s_history_is_swept.md)"
status: ""
state_sha: 28ff231f3ba4
state_source: trailer
---

# DOCS-091 — fold --commits-from --backfill: a repository's history is swept once, its old mistakes are warnings

A first sweep of an estate's repositories meets commits written before the trailer contract: a
trailer outside the last paragraph, a state word the register never had. `--commits-from` made every
issue in a listed commit an **error**, on the assumption that a list means "new work". For a
backfill that assumption is wrong, and the whole sweep goes red on history nobody can rewrite.

## Decided with the downstream lanes

- **One strict grammar.** No lenient parser for old commits; a second reader is how a register ends
  up with two truths.
- **No cutoff sha.** Many old commits carry well-formed trailers that should fold; a cutoff drops
  them silently, and it is a number someone picks once and nobody revisits.
- **Report, do not refuse, history** - exactly as `fold --check` treats old local history since
  DOCS-038: warnings, exit 0, valid trailers still fold.

## Built

`fold --commits-from <list> --backfill`. Listed-commit issues become warnings (`severity: "warning"`
in `--format json`); valid trailers fold; the dry run says the list is being read as history.
`--backfill` without `--commits-from` did not run. A refused backwards move under a declared
`progression` stays an error, because it concerns the state being written now. The caller uses
`--backfill` for the first sweep of each repository, then drops it once its watermarks list only new
commits.
