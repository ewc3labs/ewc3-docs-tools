---
id: DOCS-070
state: ⬜ planned
title: "fold: a dry run reports provenance updates, and --help prints usage"
est: S
doc: "[DOCS-070](slices/DOCS-070_fold_a_dry_run_reports_provenance_updates_and_help_prints.md)"
status: ""
---

# DOCS-070 — fold: a dry run reports provenance updates, and --help prints usage

Two gaps found by the first downstream user of `fold`:

- **A dry run should say everything `--write` will do.** It lists state changes, but not provenance
  updates (`state_sha` and `state_source` on slices whose state already matches), so `--write` then
  reported writes the dry run never mentioned.
- **`fold --help` is refused as an unknown option.** Every command should answer `--help` with its
  usage, since refusing unknown flags made `--help` the obvious thing to try.
