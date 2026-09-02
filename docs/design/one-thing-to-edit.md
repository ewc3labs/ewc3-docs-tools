# One thing to edit

> **Status: proposal.** Written by **PMO** for **EWC3Labs** and **codex** to shoot down.
> **Settles the question [Frontmatter is the declaration][frontmatter-is] deliberately left open**,
> on Wilson's call: the slice document is the authority, the roadmap is emitted from slice
> documents, and git trailers are what produce current *and* historical state.

---

## The decision

*(Wilson, 2026-09-02: "I really would love to double down on the slice doc being the authority and
the roadmap table being emitted from slice docs with tools. Let's design THAT so we have one single
thing to edit. And trailing git meta is what creates current and historical statuses.")*

**Three surfaces, and only one of them is edited.**

| Surface | Role | Written by |
| --- | --- | --- |
| **git trailers** | the **event log** — what happened, when, by whom, at which sha | a human, inside the commit they were making anyway |
| **slice-doc frontmatter** | the **fold** — current state, readable and diffable | tooling, from trailers; a human may also author it directly |
| **roadmap Delivery Index** | a **projection** — a view of every slice | generated, never edited |

```text
commit + trailers  ──fold──▶  slice frontmatter  ──emit──▶  roadmap Delivery Index
    (event)                       (current)                       (view)
         └────────────── git log ──────────────▶  the slice's history, free
```

## Why trailers, and not a status field somebody updates

**Because the trailer rides the commit that did the work.** It cannot drift from it, it is
attributable, it is timestamped, and it is already signed by whoever did the thing. Nobody maintains
a changelog and nobody remembers to update a table.

**Both halves of Wilson's sentence fall out of the same mechanism:**

- **Current** is the newest `State:` trailer for a slice, folded into frontmatter.
- **Historical** is `git log` filtered by `Slice:` — a timeline with shas, authors and dates that
  **nobody wrote and nobody can forget to write.**

Verified available: git 2.55 parses trailers natively, so the transport needs no new machinery —

```bash
git log --format='%h %ad %an %(trailers:key=Slice,valueonly) %(trailers:key=State,valueonly)'
```

## The vocabulary — two trailers, and no more

```text
Slice: VS-00397        which slice this commit advances
State: coded           the human judgement about where it now stands
```

**Two, deliberately.** Every additional trailer is another field that can be wrong, and `State:` is
already the one thing the canon says must stay human — *automation replaces the clerk, never the
judge.* The trailer does not make the judgement cheap to get right; it makes it **cheap to record
and impossible to forget.**

`est`, `priority`, `lane` and `parent` stay frontmatter-only. They are **plans, not events** — they
describe what a slice is, not what happened to it, so they have no business in a commit.

## The fold, and how a human still wins

Frontmatter records what the trailers proposed:

```yaml
id: VS-00397
state: coded
state_source: trailer      # or `human`
state_sha: 4d152c4         # the commit this state came from
```

**The fold advances state only when a newer trailer exists AND `state_source` is not `human`.** A
person marking a slice `blocked` because of something no commit knows about is authoring, and the
fold must never clobber it — the same doctrine as `summary_source`, and the same rule MedAR already
runs as *auto-hydration never overwrites a user pick.*

**Newest wins, so the log is self-correcting.** A wrong trailer cannot be edited out of history —
and does not need to be. `Slice: VS-00397 / State: coded` posted later supersedes it, and both stay
visible in the timeline, which is the honest record of a correction having happened.

> **This is not hypothetical.** A commit on `MedAR_AI_Runtime` was tagged `[VS-24]` for work that
> was actually `VS-08`, and it was corrected in STATUS rather than in history. Under this design it
> is corrected by a later trailer — **and, more usefully, a `Slice:` naming an ID that has no slice
> document FAILS THE CHECK**, so that class of mislabel stops being something a human happens to
> notice.

## Cross-repo: fold locally, roll up by projection

The objection to trailer-derived state has always been that *"the derivation must scan N repos"* —
47% of slices span more than one. **It does not have to.**

Per the `implements:` edge: a cross-repo slice has **one owning slice document** and **a pin slice
in each participating repo, each carrying its own state.** So:

- every repo folds **its own** trailers into **its own** frontmatter — purely local, no cross-repo
  git access, works in a CI job that checked out one repository;
- the owner's roll-up is a **projection over pins**, which is a document read, not a git walk.

That also makes per-repo state *representable*, which it currently is not — coded in one repo,
deployed in another, untouched in a third is the normal case and today has nowhere to live.

## The roadmap becomes a generated region, using machinery that already exists

A roadmap is not wholly generated — Working Rules, the State Legend and Slice Notes stay authored.
Only the Delivery Index is a view, and **the toolkit already wraps generated regions in markers**
(`HEADER_TABLE` and `BADGES` in this repo's own README work exactly this way).

```markdown
## Delivery Index

<!--ewc3:index-->
| ID | State | Slice | Est | Priority | Lane | Status |
| --- | --- | --- | --- | --- | --- | --- |
| VS-00397 | 🟦 coded | Two writers own MFM.Doctors | 4.0d | high | MedFM | … |
<!--/ewc3:index-->
```

**The mapping is total** — every column derives from frontmatter, with `Status` coming from
`summary`. Nothing in the row needs a source the slice document does not already have.

## What must REFUSE

The lesson of this week is that a guess is not a check. Each of these fails loudly:

| Refuses | Because |
| --- | --- |
| a hand edit inside `<!--ewc3:index-->` | regenerating differs; the edit is about to be destroyed |
| `Slice:` naming an ID with no slice document | the mislabel class above, caught mechanically |
| `State:` outside the legend | a typo silently becomes a new state otherwise |
| a fold that would overwrite `state_source: human` | names the conflict rather than picking |
| a slice-doc commit carrying **no** `Slice:` trailer | warns — adoption is the whole risk, see below |

**`fix` folds and emits; `check` verifies the fold is current and never writes.** That is the
existing split, unchanged: *CI refuses, it does not repair.*

## Honest limits

1. **A trailer nobody writes is a slice nobody sees.** This is the real risk, and it is measured:
   across 1,015 `SX_Coder` commits, **311 subjects carried a slice ID and 178 of them (57%) were
   invisible** to a `[ID]` scan. Trailers are structurally better than a bracket in a subject — but
   *adoption* is the variable, not the mechanism. The last row of the refusal table is what turns it
   from a convention into something enforced, and it should ship with the fold, not after it.
2. **A rebase or cherry-pick duplicates trailers.** Newest-wins is stable under both, but the
   *timeline* will show the same state twice. That is honest rather than wrong.
3. **The roadmap stops being hand-editable**, and eight repositories' worth of muscle memory says
   otherwise. The refusal above catches it; the migration still needs saying out loud.
4. **`git log` order is not commit order.** The fold must pick "newest" by a rule it states —
   committer date, topological order on the checked-out branch — and state it in the output, because
   two people will otherwise reasonably disagree about which trailer won.

## Open questions

1. **Does the fold run only in `fix`, or also as a commit hook?** A hook makes the trailer
   impossible to forget, which is the point — but a hook that rewrites a commit message is intrusive
   and this estate has one dormant control already (`phi-guard` as a commit hook, still unwired).
2. **What emits the roadmap's `Status` column before the summarizer exists?** `summary` is
   deliberately vacant and guarded by a test. Until an LLM fills it, the column is either blank or
   the slice title, and blank is more honest.
3. **Where does a slice document live before it is a slice?** Punchlist intake has no ID. The
   promotion moment mints one, and this design says nothing about it yet.
4. **Do pin slices get their own IDs, or share the owner's?** `implements: VS-00397` in a repo that
   mints `AIR-*` — is the pin `AIR-29` implementing `VS-00397`, or `VS-00397` with a local state?
   The first is greppable per-repo; the second keeps one identity across the estate.

[frontmatter-is]: frontmatter-is-the-declaration.md
[slice-object]: the-slice-document-is-the-object.md
