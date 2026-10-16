---
id: DOCS-092
state: 🟦 tested
title: "hook install: the commit-msg hook that checks every commit, without replacing anyone's own"
est: S
doc: "[DOCS-092](slices/DOCS-092_hook_install_the_commit_msg_hook_that_checks_every_commit.md)"
status: ""
state_sha: 2000c10d12f0
state_source: trailer
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

**Ownership is a seal, not a marker** (Codex P1, PR #50). A user who adds a check to a generated
hook keeps its marker comment, so a marker test let install replace their edit and uninstall delete
it, exit 0. The hook now carries `# ewc3-docs-sha256: <hash of its own text>`; only a hook whose
seal still matches is the tool's to update or remove. An edited one is refused like a foreign one,
byte-identical, and a hook installed from another copy of the tool is still recognised.

**Cannot check is a warning, not a block** (raised downstream before the fleet installed it). The
first version blocked when the tool was missing, naming `--no-verify` as the bypass. But agents work
under a standing rule never to use `--no-verify`, so on any machine without the tool every agent
commit stuck with only a forbidden way out. Worse, an unreadable legend made the check exit 2 and
blocked the very commit that would fix it. The hook now blocks **only for a finding** (exit 1). When
it cannot check (tool missing, exit 2) it warns on stderr, "trailer check SKIPPED; CI enforces it",
and lets the commit through. That is what "the hook is the convenience layer, CI is the gate" means
in practice. `hook install --strict` blocks in those cases too, for a repository with no CI gate;
the choice is made at install and sealed into the hook, not read from a config file.
