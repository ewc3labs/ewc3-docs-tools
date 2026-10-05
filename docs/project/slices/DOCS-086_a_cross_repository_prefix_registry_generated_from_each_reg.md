---
id: DOCS-086
state: ⬜ planned
title: a cross-repository prefix registry, generated from each register, run from a workstation first
est: L
doc: "[DOCS-086](slices/DOCS-086_a_cross_repository_prefix_registry_generated_from_each_reg.md)"
status: ""
---

# DOCS-086 — a cross-repository prefix registry, generated from each register, run from a workstation first

Decided as `W-1` (2026-10-05): **workstation first**.

Which repository owns which ID prefix has no enforced home: nothing goes red when two repositories
claim one global prefix. Each repository already declares the prefixes it owns in its own register,
and `declaredOwnership`/`contestedPrefixes` already read that; they have only ever been pointed at
one repository. This slice points them at many.

## Shape

- **One authored input**: the list of planning surfaces to read. The unit is the **planning
  surface**, not the repository — a hub plans for several repositories, which therefore have no
  register of their own and are not "missing" one.
- **One generated output**: a table of prefix, owning register, scope, last used and disposition, in
  a marked block that refuses hand edits, like every other derived value here.
- **A check** that fails when two registers claim one global prefix, naming both.
- **Workstation first.** It reads local clones and runs anywhere. CI is one workflow file away once
  the cost is worth it; nothing in the design depends on it.

## Measured inputs it must honour

- Ownership comes from what qualifies a table as a register (`docs/Reference.md`, *What counts as a
  register*) — read through `ownershipHeader`, never re-derived.
- A register that **disagrees** about a prefix's scope — owned in one, repo-local in another — is
  its own finding, distinct from a contest (`DOCS-083`).
- **Absent is not zero.** A repository with no planning surface is out of scope; a register that
  exists and declares nothing is a defect. They are reported separately (`DOCS-083`).
- Ids compare in numeric space, with padding declared per register.
- "Last used" read from `main` is stale while a pull request carries a mint; either read every ref
  or label the column as *on main*.
- An Owner cell that is a placeholder is not an owner (`isUnclaimedOwner`).
- On a first run a downstream estate is expected to report **one** finding, not zero: a regression
  detector, and it should be described as one.
