---
id: DOCS-084
state: ⬜ planned
title: "fold --commits-from: trailers from other repositories reach the register that owns the slice"
est: L
doc: "[DOCS-084](slices/DOCS-084_fold_commits_from_trailers_from_other_repositories_reach_t.md)"
status: ""
---

# DOCS-084 — fold --commits-from: trailers from other repositories reach the register that owns the slice

A hub register owns a series whose work mostly lands in **other** repositories. `fold` reads the
repository it runs in, so those `Slice:`/`State:` trailers never reach the register that owns the
slice. Measured downstream across eight repositories: 66 slices sat "planned" against merged code,
and 59 of them had evidence only outside the hub.

The request is to accept a commit list the caller assembles, so one grammar — this one — stays the
only reader of a trailer. That fits. Four parts of the proposal change, and each change is the
difference between a feature and a quiet lie.

## Interface

```text
ewc3-docs fold --commits-from <file|-> [--source-repo <name>] [--write | --check]
```

`--commits-from` takes NDJSON, one commit per line: `{ sha, repo, committer_date, message }`.
`--source-repo` names the repository when the list omits it. Everything else — the grammar, the
legend, `--write`/`--check`, the exit contract — is unchanged.

## 1. No prefix map: the register already declares what it owns

The proposal carried a `--prefix-map` file. **Drop it.** A register states its own ownership, and
the reader already returns it. Measured, on a hub register that owns two series, cites two and has
retired one:

```text
declared (may be folded)          FIX TS VS
cited, not owned (report)         XY ZZ
frozen (declared, accepts nothing) TS
```

So the filter is `declared` minus frozen, which the register answers for itself. A map file would be
a **second source of truth that can disagree with the register** — and a disagreement between a map
and a register is exactly the failure this estate spent a week on. Trailers for prefixes this
register does not own are reported as `unowned`, with counts, and applied to nothing.

A frozen prefix is a separate line: declared, owned, and **refusing** the transition, because a
retired series accepting new state is a defect worth naming rather than silently skipping.

## 2. Provenance must say that it is unverified

Today `state_sha` is a commit in **this** repository, and anyone can check it. A foreign sha is not
resolvable here, so writing it into `state_sha` alone produces a reference that *looks* local and
cannot be followed — the tool asserting something it did not verify.

- `state_repo: <name>` is added, absent meaning this repository. `state_sha` stays a sha.
- `state_source: trailer-remote` for an imported transition, against `trailer` for one read from
  local history. The field already discriminates `human` from `trailer`; this extends it rather than
  inventing a second mechanism.

**This is the trust boundary, stated plainly: with `--commits-from`, `fold` applies state from a
file it cannot verify.** The file can name a sha that does not exist, a message never committed, or
a repository that does not. Recording *that* a transition was imported is what keeps the audit trail
honest, and it costs one field.

## 3. Ordering: there is no topology across repositories

Newest-wins is decided today by `git log --topo-order` — ancestry, not clocks. **Across repositories
there is no shared ancestry**, so the only available order is `committer_date`, and dates lie: a
rebase rewrites them, a skewed clock reorders them, `--date` sets them by hand.

So this is a weaker guarantee and it is documented as one, not hidden:

- the local repository keeps topological order among its own commits;
- across sources the comparison is by date, with a deterministic tie-break — **date descending, then
  repository name, then sha** — so the same input always gives the same answer;
- the dry run prints the winning commit for every transition, `repo@sha` and date, so a surprising
  order is visible before it is written.

**The commit list adds to local history; it never replaces it.** Reading only the file would drop
trailers made in this repository, silently.

## 4. "No backwards transition" cannot be enforced, and must not be guessed

The proposal asks that a state never move backwards without an override. **`fold` has no notion of
state order** — measured: nothing in it ranks states. The legend is a *set of spellings*, not a
sequence, and it cannot become one by reading the bullets in order: `blocked`, `deferred` and
`cancelled` are not "later" than `go`.

So either the order is **declared**, or the rule is not implementable:

```json
{ "planning": "slice-documents", "progression": ["planned", "coded", "smoked", "go"] }
```

- with `progression` declared, a transition that moves a slice earlier in that list is **refused**
  unless the commit carries `State-Override: <reason>`, and states absent from the list (`blocked`,
  `deferred`) are never "backwards";
- without it, newest-wins stands as today, and the dry run shows every transition so a regression is
  seen rather than prevented.

Refusing to infer an order is the point. A guessed progression would reject correct work the first
time a register's states are not a line.

## One parser, stated

A trailer from local history is read by git's own trailer formatter; a trailer from a message string
is read by `git interpret-trailers --parse`, which is what `fold --check-message` already uses. Both
are git's parser, so a message that passes the pre-commit check and the same message arriving in a
commit list resolve to the same pairs. **There is no second grammar here, and this slice does not
add one.**

## Out of scope, by agreement

Fetching, per-source watermarks, force-push detection and deciding which commits are new belong to
the caller. `fold` reads the list it is handed, and is idempotent given the same list.

## Tests

- a commit list from two repositories advances slices the register owns, and reports the others as
  `unowned` with counts;
- a frozen prefix is refused by name rather than skipped;
- provenance: `state_repo` and `state_source: trailer-remote` on an imported transition, `trailer`
  and no `state_repo` on a local one;
- the list **adds** to local history: a local trailer and an imported one for the same slice both
  compete, and the newer by date wins with a stable tie-break;
- identical input twice changes nothing the second time;
- a malformed line, an unparseable date and a message with no trailers are each named, not skipped
  silently;
- `progression` declared: a backwards transition is refused, and accepted with `State-Override:`; a
  state outside the list is never backwards; with no `progression`, newest-wins is unchanged;
- a message that passes `--check-message` yields the same pairs when it arrives in a commit list.
