---
id: DOCS-071
state: ⬜ planned
title: "fold --check --since: say out-of-range trailers were not checked"
est: S
doc: "[DOCS-071](slices/DOCS-071_fold_check_since_say_out_of_range_trailers_were_not_checke.md)"
status: ""
---

# DOCS-071 — fold --check --since: say out-of-range trailers were not checked

A downstream conversion ran `fold --check --since origin/main` in CI and got `warning:` lines for
old commits with pre-legend `State:` trailers, all outside the range. The exit code was right (0),
but the output reads as if those commits were checked and let off with a warning.

## What happens now

`planFold` walks the full history and marks each malformed trailer `inScope` when its commit is
after `--since`. `cmdFold` prints in-scope issues as `error:` and **everything else** as `warning:`.
Without `--since` that is right: the full history is checked, and old mistakes warn rather than
fail. With `--since` it is misleading, because "not in scope" means "not checked".

## Fix

- With `--since`, print out-of-range issues as **one count line**, e.g.
  `fold: 3 malformed trailer(s) before <since> were not checked (run without --since to list them)`.
- Without `--since`, keep the per-commit `warning:` lines unchanged.
- Exit codes do not change.

## Tests

- `--since` with a malformed trailer before the range prints the count line and no `warning:` line
  naming that commit; exit 0.
- `--since` with a malformed trailer inside the range still prints `error:` and exits 1.
- No `--since`: the per-commit warnings are unchanged.
