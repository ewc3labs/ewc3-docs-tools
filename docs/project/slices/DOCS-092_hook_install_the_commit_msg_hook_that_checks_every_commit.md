---
id: DOCS-092
state: ⬜ planned
title: "hook install: the commit-msg hook that checks every commit, without replacing anyone's own"
est: S
doc: "[DOCS-092](slices/DOCS-092_hook_install_the_commit_msg_hook_that_checks_every_commit.md)"
status: ""
---

# DOCS-092 — hook install: the commit-msg hook that checks every commit, without replacing anyone's own

`fold --check-message --staged` existed "for commit-msg hooks", and nobody installed one: the check
was optional, and agents and people both forgot it. The owner's goal is that the tooling enforces
provenance rather than relying on memory.

## Two layers, stated plainly

- **The hook** is the convenience layer: it refuses a bad commit before it exists, where the fix is
  cheap. It is local and skippable (`--no-verify`, a web-UI merge, a machine without it).
- **The gate** is `fold --check --since <merge-base>` as a required CI check: it cannot be skipped.
  This repository runs it on itself since PR #47. The hook never replaces the gate.

## Built

`ewc3-docs hook install | uninstall`.

- Installs where git runs hooks from: `git rev-parse --git-path hooks`, so `core.hooksPath` and
  linked worktrees are honoured. Writing to a `.git/hooks` git does not read would be a hook that
  never runs, silently.
- **Never replaces a hook it did not write.** A `commit-msg` hook may be someone's whole workflow:
  install refuses, exit 2, and prints the one line to add to it. There is no `--force`. Uninstall
  removes only its own.
- At commit time it runs the repository's `node_modules/.bin/ewc3-docs`, else the copy it was
  installed from, else `ewc3-docs` on `PATH`. **Found nowhere, it blocks the commit** and names
  `--no-verify`, because a hook that waves every commit through when the tool is missing is the
  failure it exists to prevent.
- POSIX `sh`, LF line endings, and forward-slash paths, so Git for Windows runs it unchanged.

Tested through real `git commit`s: a bad trailer and an unnamed staged document are refused, and no
commit is made; a good one lands. A hook that always passed fails those tests (measured).
