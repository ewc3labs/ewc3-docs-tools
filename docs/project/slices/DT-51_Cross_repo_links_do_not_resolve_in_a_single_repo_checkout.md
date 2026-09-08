---
id: DT-51
state: ⬜ planned
title: Cross-repo relative links cannot resolve in a single-repo checkout
est: M
doc: '[DT-51][dt-51]'
status: 'CI red for 8 runs; 9 of the 10 failures are the relative half of a twin link, the 10th has no twin and is genuinely dead'
priority: high
lane: links
---
# DT-51 — Cross-repo relative links cannot resolve in a single-repo checkout

A relative link that **leaves the repository** assumes a sibling tree at a fixed depth. Any checkout
without that sibling breaks it. There are two live instances, and the one that matters is CI.

## Measured, at `9b07f6d`

```
main checkout        node bin/ewc3-docs.js check   ->  exit 0, 63 links resolve
linked worktree      node bin/ewc3-docs.js check   ->  exit 1, 10 cross-repo targets dead
isolated archive     node bin/ewc3-docs.js links   ->  exit 1, the same targets dead
```

The third is the CI condition, reproduced by `git archive`-ing the branch into a directory with no
siblings — which is what `actions/checkout@v4` produces. `.github/workflows/ci.yml` runs
`node bin/ewc3-docs.js check`, so **this branch's CI is red today and has been for the last 8 runs**
(LabsHQ, from the Actions log).

**Same-repo relatives are unaffected** in every case, because both endpoints move together.

> **A worktree is a SUBSET of the real defect. The real defect is that cross-repo relative links
> cannot resolve in any single-repo checkout, and CI is the instance that is failing production.**

## The `--git-common-dir` fallback is refuted — do not build it

The first version of this slice proposed: when a relative target fails and the checkout is a linked
worktree, retry from the main worktree root. **Two independent reviews killed it, for two different
reasons, and both are sufficient on their own.**

**1. It does not fix CI** (LabsHQ). In CI there is no linked worktree *and* no sibling repo, so there
is nothing to fall back to. The fallback would make a dev box green while CI stayed red — **worse
than both being red, because it trains people to ignore CI.**

**2. It answers the wrong question** (EQPE). `--git-common-dir` points at the main checkout's working
tree, and that tree is **on another branch**:

> Every fallback resolution answers *"does this exist in the main checkout right now?"* The question
> is *"does this exist for a reader of this branch?"* The fallback is structurally incapable of
> answering the second — it is not that it sometimes gets it wrong.

EQPE broke two successive guards on it. `git cat-file -e HEAD:<path>` cannot address a cross-repo
target, which is the only case the fallback exists for. Scoping to *targets that escape the
repository root* then admits the link that escapes and **re-enters the same repo by name** —
`../../../ewc3-docs-tools/README.md` escapes, so the predicate fires, and it resolves into the main
checkout on a different branch. Delete that file on this branch and `check` stays green while the
link is dead for every reader of it.

**A guard that narrows WHICH links get the wrong question asked does not stop the wrong question
being asked.**

## The twin-link convention already exists, and the checker verifies the wrong half

Measured across the three failing documents: **of the 10 failing cross-repo targets, 9 are the
relative half of a TWIN LINK whose GitHub half sits in the same reference block.** One is not.

```
[ewc3-prefix-registry]:   ../../../../ewc3labs-hq/docs/project/EWC3_Prefix_Registry.md   <- checked, unverifiable here
[ewc3-prefix-registry-2]: https://github.com/ewc3labs/ewc3labs-hq/blob/main/...          <- skipped by isExternal
```

This is deliberate and documented: *"the relative one resolves for an agent reading the filesystem
..., the GitHub one resolves on the web."* So the relative half is **for local agents and is not
expected to resolve anywhere else** — and `links` checks exactly that half while skipping the half
that can be verified from any checkout.

> **The checker verifies the unverifiable link and ignores the verifiable one.**

`DT-48` already ruled the shape this needs, for sibling *registers*, and it applies unchanged here:
the check has **three outcomes — clean, dangling, and UNVERIFIED** when the sibling cannot be read.
Sibling-unreachable is neither pass nor fail, and *"a check that reports a network failure as a data
defect trains people to ignore it."* A cross-repo target absent from a single-repo checkout is
UNVERIFIED, not dead. **CI is red today because an UNVERIFIED is being reported as a FAIL.**

⭐ **And the collapse is hiding a real defect.** The tenth link —
`2026-08-09_dt-045_slice_registry_and_cictl_slice_cli.md` — has **no GitHub twin**, so it is
genuinely unreachable for every reader who does not have the whole estate cloned at the expected
depth. It is currently indistinguishable from the nine that are working as designed. **Nine false
positives and one real defect, all wearing the same error message** — which is the shape this repo
has spent the day cataloguing.

**Rule that falls out, and it needs no name map and no rewrite of existing links:**

1. An escaping relative target is **UNVERIFIED** — counted and reported, never failed, and
   **unconditionally**. See the caution below: this must not depend on what is on disk.
2. A cross-repo relative link with **no twin** is a **FAIL**, because nothing can reach it.
3. **The pair is checked against itself, offline.** Not by fetching the twin — see below.

That turns CI green for the right reason *and* surfaces the one link that is actually broken.

### Do not fetch the twin — it manufactures the class DT-48 forbids

An earlier version of rule 3 said *"the GitHub twin is the checkable artifact and should stop being
skipped."* EQPE killed it, and it contradicted rule 1 in the same breath: **fetching the twin makes
every `check` run a network operation.** A slow github.com, a runner with no egress, unauthenticated
rate limits at 60/hr, or a private sibling returning 404-because-not-yours all become *"this link is
dead."* That is DT-48’s own sentence one layer up. If it is ever done it needs the same three
outcomes and belongs behind `--online` or a scheduled job that can be red without blocking anyone.

### The pair is checkable against itself, offline and deterministically

EQPE’s proposal, and it is the cheapest verification in this whole exchange:

```
[x]:   ../../../../ewc3labs-hq/docs/project/EWC3_Prefix_Registry.md
[x-2]: https://github.com/ewc3labs/ewc3labs-hq/blob/main/docs/project/EWC3_Prefix_Registry.md
                              ^^^^^^^^^^^ repo   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ path
```

**Both halves name the same repository and the same path.** Normalise and compare — no network, no
clone, no estate, no map. It catches a twin that drifted from its relative, a twin naming the wrong
repo, and a relative pointing at a path that exists only on a feature branch while its twin says
`/blob/main/`.

> **The twin is not merely a fallback for web readers. It is a second independent statement of the
> same fact, and two statements of one fact can be checked against each other without consulting
> the world.**

**Measured 2026-09-08, implemented as a throwaway script against all three documents: 9 pairs, 9
AGREE, 0 drift.** So the check ships green on day one and needs no migration — the property `DT-49`
required of the canonicality lint before adopting it.

⛔ **UNVERIFIED MUST BE UNCONDITIONAL — never *"unverified if unresolvable"*** (LabsHQ). If an
escaping target FAILs on a dev box where the sibling happens to be cloned and UNVERIFIEDs in CI
where it is not, **the same link has two verdicts depending on who is asking**, and `check` becomes
a machine-dependent oracle. That is the observer-local defect this estate spent 2026-09-08
cataloguing, arriving inside the remedy for it. **Escaping ⇒ UNVERIFIED everywhere, regardless of
what is on disk.** `DT-48`’s three outcomes only stay meaningful if the third is not secretly a
fourth. The cost is accepted deliberately: a genuinely wrong escaping path is no longer caught by
resolution, which is exactly why the offline pair-check above carries that weight instead.

### Provenance of the tenth link, and why the no-twin rule is worth building alone

The twin-less target is `ff48479`, 2026-08-24 — **LabsHQ’s own Labs response appended to the
document that states the twin convention, in a review about link integrity.** The other MedAR links
in that same file are twinned, so it was plainly possible and simply not done. Self-reported.

**The no-twin FAIL needs no infrastructure whatsoever** — it is a within-file check: an escaping
relative definition with no sibling URL definition. No name map, no network, no catalog, no estate
convention. **It would have caught that link on the commit that introduced it, two weeks ago.**

⚠️ **Both stations over-counted this the same way on first cut, and the error is instructive:** we
each filtered for *"starts with `../`"* and reported it as *"escapes the repository."* Same-repo
relatives start with `../` too, so `EWC3_Docs_Tools_Roadmap.md` appeared as a second twin-less
target in both first passes. **A correct answer about the wrong property**, in the measurement built
to find exactly that.

### HQ-2, de-scoped

LabsHQ has de-scoped HQ-2 on this measurement, and the reasoning belongs here because it bounds
what this slice must do. HQ-2 was justified as *"nothing checks a link that leaves its own
repository."* The rule above checks the thing that is checkable — **the twin’s presence** — turning
nine unverifiables into counted non-events and one genuine break into a failure. That is HQ-2’s
value at a fraction of its cost, and it lives here rather than in HQ.

One distinction of theirs survives EQPE’s objection and is worth keeping, because it says when a
name map *would* earn itself:

| | | |
| --- | --- | --- |
| **key** | `ewc3labs/ewc3-docs-tools` | a GitHub org/repo pair — globally identical, and the one string in today’s catalogue that is **not** observer-local |
| **value** | the local path | machine-local, allowed to drift, **because locations do** |

So a name map is coherent; it is merely not needed to make CI green. HQ-2 becomes at most a later
optional layer verifying a twin’s *target* rather than its *existence*.

### Known cost, unsolved

`/blob/main/` pins a branch, so a twin pointing into a feature branch is wrong the moment it merges.
This is already true of the twins in the repo, not only of new ones. Neither reviewer has a clean
answer; recorded here so it is a known cost rather than a later discovery.

⚠️ **Implementation note the proposal needs: the local directory name is NOT the GitHub owner.**

```
rel  Programs_MedAR/DevTools  ::  DevTools/docs/PHI_ANONYMIZATION.md
url  MedARMS/DevTools @main   ::  docs/PHI_ANONYMIZATION.md
```

`Programs_MedAR` is a local layout choice; `MedARMS` is the GitHub owner. So the comparison is on
**repository name plus path**, never owner-against-parent-directory — and the relative form carries
the repo segment the URL path does not, so one side must be stripped before comparing. This is
EQPE’s own *"a name is not an identity"* argument arriving inside the check built on names.

## Direction — decide once, estate-wide

LabsHQ's widening: **resolve a cross-repo link by repository NAME rather than by relative path.** The
worktree and CI cases both fall out for free, because neither depends on a sibling existing at a
computed depth. This overlaps their **HQ-2** and is a convention question for the estate, not a
parser question for this repo — **flagged, not claimed.** It wants deciding once rather than twice.

Until it is decided, this row must not be read as *"worktrees are fixed"*: **DT-51 does not make CI
green**, and saying otherwise in the register would be the same misdirection `DT-52` is about.

## If any fallback is ever built, it reports

Settled by both reviewers, from opposite directions:

- **Never a per-link warning** — it fires on every worktree run and becomes noise (LabsHQ).
- **Never silent** — a fallback resolve is the *only* signal that an answer came from a different
  branch's checkout (EQPE).

Both are satisfied by stating it as fact, not alarm:

```
Checked 63 relative links; 10 resolved via the main checkout, not this branch.
```

Countable, visible, no alarm fatigue — and it makes the reliance measurable, which a warning does not.

And it must be guarded twice, both established by review rather than argued:

**Containment, not escape** (LabsHQ). "Escapes the repository root" is too weak, because an escaping
path can **re-enter the same repository** — `../../ewc3labs-hq/docs/X.md` from a worktree lands in
that repository's *main checkout*, which is branch-divergent content, exactly what the rule exists
to exclude. EQPE found this hole in my escape-scoping and LabsHQ reproduced it independently. The
checkable form: after resolution, **reject if the realpath is inside any checkout of this
repository** — a fallback may only reach a *different* repository. One comparison, strictly stronger.

⚠️ **Normalise case and separators before that comparison.** LabsHQ’s own first attempt at this
test returned the wrong answer, because it compared `/c/DEV/...` against `C:/DEV/...` as strings.
That is the drive-letter instability recorded in `Fleet_Radio_Protocol.md` this morning, hit by its
author three hours later. **On Windows the guard silently fails open**, and the masking returns
behind a comparison that reads as correct.

Both guards make a fallback *safer*; **neither makes it sufficient.** In CI there is still no
worktree and no sibling, so a perfectly guarded fallback remains inert against the failure that is
actually red. They are recorded for whoever builds one, not as an argument to build one.

## Mechanism notes, verified

- **Worktree detection:** `git-dir != git-common-dir`, true only in a linked worktree. Verified false
  in a main checkout and, per LabsHQ, in a submodule.
- **Main worktree path:** `git worktree list --porcelain | head -1`, which gives it directly.
  `dirname(--git-common-dir)` is wrong in a submodule, where it lands inside `.git/modules`.
- Nested worktrees do not exist in git — a worktree of a worktree shares the same common dir — so
  that case is empty.

## Adjacent, deliberately not scoped here

- `isExternal` skips `https?:`, `mailto:` and `#`, so anything leaving the repo by URL is unchecked
  by a second route.
- `check` walks gitignored files: `*/scratch/` is ignored, yet the main checkout reports 13 files and
  a fresh worktree 12. **The checked population depends on what is lying around.**
