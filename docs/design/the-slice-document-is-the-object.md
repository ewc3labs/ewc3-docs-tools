# The slice document is the object

> **Status: proposal.** Written by **SXC** for **EWC3Labs** to build or shoot down.
> Extends [Clerical work belongs to CI][clerical-work], which established
> *one authority, N generated projections*. **This names the authority.**

---

<!-- ewc3:effort:start -->
## 🧭 The effort — the same map, in every document

**Goal: stop hand-maintaining derived facts.** A slice is authored **once**, as a document. Every
list, roadmap row, status and per-repo evidence entry is **generated** from it. Local LLMs draft
what is judgement-adjacent; **deterministic code decides anything that matters**, and a human still
judges whether work is *done*.

| Document | Decides | Owner |
| --- | --- | --- |
| [Clerical work belongs to CI][clerical-work] | **the canon** — what is clerical, and the measurement that makes it urgent | Labs |
| **The slice document is the object** | the authored authority — frontmatter, typed graph, git trailers, Ready/Blocked | Labs · ← **you are here** |
| [Prefix registry and `repoHQ`][prefix-registry-and] | cross-repo prefix ownership, generated rather than hand-synced | Labs |
| [EWC3 Prefix Registry][ewc3-prefix-registry] · [🔗][ewc3-prefix-registry-2] | who owns which ID series **today**; global by default, `FIX` repo-local | Labs HQ |
| [LLM-assisted docs & PHI boundary][llm-assisted-docs] · [🔗][2026-08-24-llm-assis] | **the lanes and the chat registry**, plus the shared invariants | MedAR |
| [MedAR PHI-in-git convention][medar-phi-in-git] · [🔗][phi-anonymization-md] | what may enter git; only *impossible* values are exempt | MedAR |

Cross-repo entries carry **both** links: the relative one resolves for an agent reading the
filesystem (both trees are cloned to the same paths on every machine), the GitHub one resolves on
the web. Same twin-link convention MedAR already uses.
<!-- ewc3:effort:end -->

## The claim

**A slice is a document. Everything else about it is a view.**

The row in the Delivery Index, the punchlist citation, the per-repo `STATUS.yaml` evidence, the
"where are we" report — all generated, never authored. Wilson: *"I freaking love the idea of
document as source of truth, and lists and statuses and commit messages generated from it."*

Today the same five facts live in **two** places — the slice doc says
`**State** ⬜ planned · 4.0d · **High** · MedFM / Gateway / Caches`, and the table row says it again.
That duplication *is* the drift.

---

## 1. The object

```markdown
---
id: VS-00397
title: Two writers own MFM.Doctors — retire the second IBM i channel
state: coded            # ⬜ planned · 🟦 coded · 💨 smoked · 🟩 go · 🟧 blocked · ⏸️ deferred · 🟥 cancelled
est: 4.0d
priority: high
lane: MedFM / Gateway / Caches
depends_on: [VS-00352]
followers: [VS-00398]
implements:             # this repo's half of a cross-repo slice owned elsewhere
parent:                 # a slice family, if this is a member
summary:                # generated; a human value here is NEVER overwritten
summary_source: generated
---

# VS-00397 — Two writers own MFM.Doctors

Narrative. Whatever a human needs to understand the work. Design and analysis are **pinned by
ordinary markdown link** — [the gateway design](../design/2026-08-03_medfm_gateway.md) — and the
summarizer reads them too.
```

**A reasonably descriptive slice doc is often the whole slice.** Big analysis and design docs get
*pinned*, not inlined.

---

## 2. The graph, and the one decision that decides whether it works

Slices link to slices. `ewc3-docs links` **already** verifies every relative link resolves and
reports orphans — so **referential integrity is free**. The graph is a real graph the moment we say
it is one.

> ### ⚠️ Typed edges, or the graph is noise
>
> A bare markdown link from A to B is ambiguous: *depends on* · *follows* · *supersedes* · *see also*
> · *mentioned once in passing*. Build the graph from bare links and **"what is blocking this?"
> returns everything the author ever cited.**
>
> **Therefore: the graph comes from frontmatter (`depends_on`, `followers`, `parent`), and prose
> links stay prose.** Frontmatter is the typed edge; inline links are for humans. Both are checked;
> only one is traversed.

**Also required, cheaply:**

- **`implements:` is a fourth edge, and the ladder needs it** *(SD, 2026-08-24)*. Nearly half of all
  slices span repos, and per-repo state is genuinely different — coded in one, deployed in another,
  untouched in a third. So a cross-repo slice gets **a pin slice in each participating repo**, each
  carrying `implements: <owning-slice>` and **its own state**. Status then walks the ladder. An
  untyped pin cannot tell *"this repo implements it"* from *"this repo mentions it"*. **The tool
  mints the pin slice; a human owns its state** — clerk creates, judge decides.
- **Cycle detection.** `A depends_on B`, `B followers A` will happen. Check it, fail loudly.
- **Edge symmetry is derived, not authored.** If `A.depends_on = [B]`, then B is a follower of A.
  **Do not make a human write both halves** — that is the same fact stored twice, which this
  document exists to abolish.

---

## 3. Slice families

*(Wilson: "one slice doc pinning other slice docs as dependencies and followers… we might emit a
different slice family doc summarizing the whole thing.")*

**Membership is declared by the member** (`parent: VS-00397`), never by a list in the parent. A new
member then costs one edit, not two, and cannot be added to a family that does not know about it.

**The family document is therefore a view** — generated, listing members with their states and a
rolled-up summary. If someone needs to *author* judgement about a family ("why these belong
together"), that is a normal slice doc with `parent:` empty and members pointing at it.

---

## 4. "Where are we" — the part that gets messy

Wilson: *"could get messy but worth chewing on."* **It does, and here is where.** A table sorts; a
graph does not have a natural reading order. Traversing "all related slices" produces a blob nobody
can act on.

**So the graph does not get rendered. It gets projected into the questions people actually ask:**

| View | Query |
| --- | --- |
| **Ready** | state is `planned` **and** every `depends_on` is `go` |
| **Blocked** | state is `planned` **and** some `depends_on` is not `go` — *name the blocker* |
| **In flight** | state is `coded` or `smoked` |
| **Waiting on me** | in flight, and a follower is `ready` |
| **Family roll-up** | members by state, worst state wins |

**"Ready" is the one that pays for the whole graph.** Nothing else we have answers *"what can I
actually start right now?"* without a human reading the roadmap end to end.

---

## 5. Generated commit messages — the honest limit

Wilson wants *"commit messages generated from it."* **Partly.**

A commit message describes **this change**; a slice doc describes **the whole slice**. Generate the
message and every commit in a slice reads identically — which is worse than what we have.

**What is actually clerical, and should be generated:**

```text
<subject the human/agent writes — what THIS commit did>

<body the human/agent writes>

Slice: VS-00397
State: coded
Co-Authored-By: ...
```

**The trailers are the clerical part.** `Slice:` and `State:` are git-native, machine-parseable,
attributable, timestamped — and they are how the tooling learns state **without anyone updating a
table**. The prose above them stays human, because it is the one thing no other artifact records.

**`State:` in a trailer is a human judgement recorded cheaply — not a derived fact.** Per the canon:
*automation replaces the clerk, never the judge.* Deciding a slice is **done** rather than merely
committed stays a person's call; the tool just makes recording it free and forgetting it impossible.

---

## 6. Which direction is the source of truth?

Two mechanisms now carry `state` — frontmatter and git trailers. **Pick one, or they drift.**

| Option | |
| --- | --- |
| **A. Frontmatter authoritative** | trailers are advisory; a state change is a commit editing the doc. Simple, one place, works with zero git archaeology. **But** state changes cost a doc edit even when the commit already says it. |
| **B. Trailers authoritative** | frontmatter `state:` is *generated* from the latest trailer across all repos. Zero-effort recording, and it solves the 47%-cross-repo problem — evidence is gathered where it happened. **But** the derivation must scan N repos, and a slice with no trailer has no state. |
| **C. Trailers propose, frontmatter records** | tooling reads trailers and **writes** frontmatter, idempotently. Frontmatter stays the single readable authority; trailers are the input. |

**Recommendation: C.** It keeps the document as the thing you can read and diff, makes recording
free, and the derivation is a projection — the same shape as everything else here. **Open for
argument; this is the decision EWC3Labs should make first.**

---

## 7. Consequences for the LLM summarizer

- **The summarizer reads the transitive closure** — slice doc **plus** pinned analysis/design docs.
- **Therefore the cache key is a hash of that closure**, not of the slice file. A design doc
  changing must invalidate the summary. *(Canon: idempotent, always.)*
- **`summary_source: human` is never overwritten.** Same doctrine as user-pick-beats-hydration.
- **Feed `state` into the prompt.** Measured failure: the model wrote `planned` and `deferred`
  slices in the past tense because state was not in context.
- **Ask for the defect, not the diff.** Measured: the model describes the solution; humans describe
  the problem, which is what makes a row scannable.
- **No endpoint → no summary, exit 0.** Never in `check` or `fix`.

---

## 8. Staging

| | Ships | Needs |
| --- | --- | --- |
| **1** | frontmatter object; Delivery Index generated from it | nothing new |
| **2** | typed graph + cycle check + **Ready / Blocked** views | 1 |
| **3** | `Slice:`/`State:` trailers → frontmatter (option C) | 1 |
| **4** | families as views | 2 |
| **5** | LLM summaries over the closure | 1, endpoint optional |

**Each ships alone. None requires an LLM.**

---

## 9. Open questions

1. **§6 — which direction wins.** Decide before building 3.
2. **Frontmatter in a *generated* file?** `migrate-project` currently emits slice docs. Once they
   are authored, migration is a one-time import, not a repeatable generator. **Say so explicitly**,
   or someone regenerates over authored content.
3. **Do MedAR repos adopt this, or only Labs?** MedAR carries the 22% clerical tax and the 47%
   cross-repo fan-out — it is the motivating case but also the riskier one.
4. **Cross-repo trailer scan** overlaps **DT-16** (org-level series check). Same traversal, two
   uses.
5. **⚠️ Cross-repo pinning breaks the `FIX` canon** *(found by SD, 2026-08-24)*. The registry keeps
   `FIX` repo-local on an explicit justification — *"a fix is never referenced from outside the
   repository it fixes"* — and **`implements:` is exactly that reference**. `FIX-96` is unambiguous
   inside `SX_Coder` and meaningless from `MedAR_Service_Daemons`, where another may exist.

   | Option | | |
   | --- | --- | --- |
   | **1. Repo-qualify on reference** | `SX_Coder:FIX-96` | bare at home, qualified only where needed |
   | **2. Compound prefix** | `DT-FIX-12` | recreates the coordination cost `FIX` exists to avoid |
   | **3. Never pin a `FIX`** | promote it to a slice | defends the canon; **requires prescience** |

   **SXC recommends 1; SD prefers 3.** The case against 3: it demands you know *at mint time*
   whether work will ever be referenced cross-repo, which you usually do not — and its exit,
   retroactive promotion, **breaks identifiers already written into commit trailers and merged
   history, where we cannot rewrite them.** Option 1 needs no decision at mint time and costs
   nothing when a `FIX` stays local. It is also a pattern already load-bearing at MedAR:
   **`(SXdb, Record)`** — an identifier unique only within its scope, qualified by that scope when
   referenced from outside. `Record 12345` alone is meaningless; `M55DB1:12345` is not. Both agree 2
   is the worst option.
6. **`next <PREFIX>` was deferred as DT-15** (*"only the +1 is manual"*).
   **Mint-that-creates-the-file is a different thing** — the file's existence is the reservation,
   which also removes the concurrent mint race. Justify it on that, not on `+1`.

## Labs response — build it, and the corpus moves two of the arguments

> Written by **Labs** against `6c10c1a`, with `SX_Coder` cloned and measured for the first time. The
> model is right and I would build it. Two sections are *understated* — §5's case for trailers is
> much stronger than the reasoning it gives, and §9 Q2 is not a design question but an open window.
> One premise in §2 is false for the corpus this targets, §8's staging cannot ship as written, and §1
> contradicts §2 in its own specimen.

### Measured first

```text
SX_Coder, all history                                          1015 commits
  subjects carrying a slice ID in some form                     311
  ...visible to DT-045's  \[ID\]  scan                          133
  ...MISSED                                                     178   (57%)

docs/project_v2/slices, already emitted and committed           383 documents
  ...carrying frontmatter                                         0

[[wiki-links]] in the live roadmap                               93   (31 distinct targets)
  ...resolving to a file                                          0
  ...visible to `ewc3-docs links`                                 0
```

### §6 — C, and it is not a coin flip

C is the **third** instance of a pattern this estate has already chosen twice. [DT-045][dt-045]
decided it for slice numbers — *"the stored cell becomes a checksum, not a source… tools verify it
and complain when it disagrees with reality."* [The prefix registry][prefix-registry-and] decided it
for prefix ownership — hand-edit `owned`, generate `observed`, fail on divergence. C is the same
move for `state:`.

The objection that C stores a derivable fact twice does not land, and the distinction is worth
stating precisely: **trailers are an event log, frontmatter is the fold.** The fold is
marker-delimited and machine-owned, exactly like `<!--ewc3:lastDT-->` is today.

Deciding anything else makes `state:` the one derived fact in the system that works differently from
every other derived fact. **And C's stated cost — the N-repo scan — is DT-16**, already on the
Delivery Index. §9 Q4 spots the overlap and undersells it: DT-16 stops being speculative and becomes
load-bearing.

### §5 — the case for trailers is much stronger than the document makes it

§5 argues from bookkeeping. The corpus argues from failure, and it is the better argument.

I assumed `[VS-380]` in a commit subject was a working convention that a `Slice:` trailer would
merely duplicate. **It is not working.** Of 311 subjects carrying an ID, DT-045's scan sees 133 —
and the 178 it misses are concentrated in exactly the wrong place:

```text
[roadmap] Mint VS-401 -- name the shared base BASE, not MAR
[roadmap] Mint VS-396 and FIX-94; register to VS-396 / FIX-94
[roadmap] Mint VS-393..395 and FIX-92/93; register to VS-395 / FIX-93
[VS-380..383][design] MedExtract daemon — plan composition moves into Python
```

**The mint commits are the ones the scanner cannot see.** DT-045's stated purpose for that source is
*"catches IDs used in commits but never registered"* — and the moment an ID exists without a row
**is** the mint commit. The safety net has a hole shaped like the thing it catches; it works only
when the register was already right, which is the definition of a useless backup.

The cause is ordinary: the bracket slot was colonised by commit *type* — `[docs]` 53, `[status]` 28,
`[design]` 22, `[roadmap]` 9 — so the ID moved into prose. Nine range forms (`[VS-380..383]`) and
six list forms close the bracket on `.` or `/` instead of `]`. This is the same disease
`lib/slices.js` already documents one surface over: *"sixteen distinct forms appear in one roadmap,
which is what happens when a heading is prose."*

**So `Slice:` is not duplicating a working mechanism. It is replacing one that measurably does not
work** — a fixed slot no prose form can defeat. That is the argument to make.

**One correction back to DT-045, and it is free:** its git-log scan should use the liberal
`\bVS-0*(\d+)\b`, not the bracket form. For max+1 derivation over-catching is safe — you skip a
number — while under-catching collides. Same *accept liberally, emit strictly* rule the prefix
registry already settled for padding, applied to the scanner.

### §2 — "referential integrity is free" is false for the corpus this targets

§2 rests on it: *"`ewc3-docs links` **already** verifies every relative link resolves and reports
orphans — so **referential integrity is free**."*

True of markdown links. The live roadmap does not use markdown links for its concept references:

```text
[[three-level-dereferencing-dw-engine]]        14 occurrences
[[hydration-provenance-user-pick-protection]]   7
[[design-mantra-reusable-code]]                 6
```

93 occurrences, 31 distinct targets, **none resolving to a file and none visible to `links`** —
`LINK`, `DEFINITION` and `USE` in `links.js:22-26` match `[text](target)`, `[label]: target` and
`[text][label]`, and `[[slug]]` is none of those. `migrate-project` copied all 93 into the emitted
corpus verbatim, which is **correct** under I4 (*generate, never rewrite the record*) and is why
they are now in 32 of the 383 slice documents.

`links` is not broken; the claim in §2 is. And the residue is worse than a gap in coverage: a
`[[slug]]` **looks** like a typed edge, which is precisely the ambiguity §2's warning box exists to
prevent, in a syntax nothing checks at all.

Not a blocker, and cheap either way — teach `links` the form, or stop emitting it — but §2 should
not be built on a premise the target corpus disproves. **Decide which before Stage 2**, because the
graph is the thing that would inherit the ambiguity.

### §1 contradicts §2 in its own specimen

§2 is unambiguous: *"Edge symmetry is derived, not authored… **Do not make a human write both
halves** — that is the same fact stored twice, which this document exists to abolish."*

§1's frontmatter then lists `depends_on: [VS-00352]` **and** `followers: [VS-00398]`, both as plain
authored fields with no marking to say otherwise. One of them is generated. It needs the
`summary_source:` treatment, or marker delimiters, or to leave the authored example entirely —
otherwise the specimen teaches the duplication the prose forbids.

### §8 — Stage 2 cannot ship as written, and the fix is a staging edit

§8 says Stage 2 (typed graph, cycle check, **Ready / Blocked**) *"needs 1"* and nothing else. That
stops being true the moment `implements:` exists, because `implements:` makes the graph cross-repo
by construction — and §2 says nearly half of all slices span repos.

The prefix registry already settled what that costs:

> dev box → sibling repos on disk, a path works · **CI → one repo checked out, a path does not work**

So **"Ready" cannot be computed in CI for a cross-repo slice.** Stage 2 as specced yields a view
that is correct for the 53% of slices living in one repo and **silently incomplete for the other
47%** — reporting *ready* for a slice whose blocker is in a repo it cannot see. That is the failure
this roadmap names by hand: *"a checker announcing green while checking nothing."*

**Split Stage 2.** Repo-local Ready ships on Stage 1 alone and **refuses to answer** for any slice
carrying a cross-repo edge, rather than answering wrongly. Cross-repo Ready depends on the HQ walk
from the prefix-registry proposal — the same wall that made `observed` an HQ-side artifact riding
the pullup chain. Two stages, an honest boundary, and the dependency stops being invisible.

### §9 Q2 — not a design question. An open window, and it is open now

Q2 asks whether frontmatter belongs in a generated file. The migration has **already run on the live
roadmap**: 383 slice documents committed under `docs/project_v2/slices`, **none carrying
frontmatter**. So this is not a question about a future generator overwriting authored content — it
is a backfill of 383 files that is trivial *only while the generator is still the sole author*, and
stops being trivial the first time a human edits one.

Worse, what those files carry today is the duplication this document opens by naming:

```text
**State** ⬜ planned · 2.0d · High · SX_DW / SQL / Ops
```

That is §"The claim"'s example, machine-generated into 383 files. Every day it sits there the
duplication is being ratified in a place `values` cannot reach — `SX_Coder` has **no
`.ewc3-docs.json`**, so the `<!--ewc3:lastVS-->` markers the migration emitted are inert and
`Last Used` never refreshes. A marker with nothing deriving it is the same failure one level down.

**Answer: say it explicitly, and do the backfill before the swap.** `migrate-project` becomes a
one-time importer whose guard is mechanical — *refuse to write any file that already has
frontmatter*. That is a few lines, it makes re-running safe forever, and it costs nothing to add now
versus a reconciliation later.

### §9 Q5 — settled, by a constraint neither side invoked

Both parties argued option 3 (*never pin a `FIX`*) on prescience. There is a harder argument, and it
is decisive: **once `Slice:` trailers ship, identifiers become immutable published facts in merged
history.** Option 3's only exit is retroactive promotion, which rewrites identifiers already written
into commits that cannot be rewritten. It is **disqualified by construction**, not by preference.

That leaves option 1, and it needs no new machinery in either house: `cictl catalog` resolves a repo
name to a path at MedAR, and `repoHQ` maps a repo name to an identity at Labs. `SX_Coder:FIX-96`
needs exactly that and nothing more. **SXC's recommendation stands; SD's objection is answered.**

### Reconciling with DT-045, which is unbuilt and therefore free

`SliceSeries` config exists nowhere in `SX_Coder` — DT-045 phase 1 was never built. Nothing has to
be unwound, and the two designs do not overlap once named:

| | owns |
| --- | --- |
| [DT-045][dt-045] | **identity** — where a number comes from, who owns a series, how concurrent mints do not collide |
| **This document** | **authority** — what the object is once it exists, and which surfaces are views of it |

They meet at exactly one place, the commit, and §5 above resolves it. Worth noting they disagree on
one decided point: DT-045 §4.1 says zero-padding is *"derived from the register's existing rows,
never assumed"*, which the prefix registry later superseded with **default 5, declarable, emit
padded / accept any**. DT-045 predates that decision and should carry a note rather than be
re-litigated.

### Where this leaves it

Nothing here changes the model. In order:

1. **§1** — mark `followers:` as generated, or drop it from the specimen.
2. **§9 Q2** — say migration is a one-time import; add the has-frontmatter guard; backfill the 383
   while the window is open.
3. **§2** — decide `[[wiki-link]]`: teach `links`, or stop emitting. Before Stage 2.
4. **§8** — split Stage 2 into repo-local Ready (refuses on cross-repo edges) and HQ-side Ready.
5. **§5** — `Slice:`/`State:` trailers as specced, and DT-045's scanner goes liberal.
6. **§6 → C** and **Q5 → option 1** stand as decided.

And one thing Labs should do for itself: `SX_Coder` needs an `.ewc3-docs.json` before any of this
lands, or the generated half is inert wherever it is written.

[2026-08-24-llm-assis]: https://github.com/MedARMS/DevTools/blob/main/docs/design/2026-08-24_LLM_assisted_docs_and_PHI_boundary.md
[clerical-work]: clerical-work-belongs-to-ci.md
[dt-045]: ../../../../../Programs_MedAR/DevTools/docs/design/2026-08-09_dt-045_slice_registry_and_cictl_slice_cli.md
[ewc3-prefix-registry]: ../../../../ewc3labs-hq/docs/project/EWC3_Prefix_Registry.md
[ewc3-prefix-registry-2]: https://github.com/ewc3labs/ewc3labs-hq/blob/main/docs/project/EWC3_Prefix_Registry.md
[llm-assisted-docs]: ../../../../../Programs_MedAR/DevTools/docs/design/2026-08-24_LLM_assisted_docs_and_PHI_boundary.md
[medar-phi-in-git]: ../../../../../Programs_MedAR/DevTools/docs/PHI_ANONYMIZATION.md
[phi-anonymization-md]: https://github.com/MedARMS/DevTools/blob/main/docs/PHI_ANONYMIZATION.md
[prefix-registry-and]: prefix-registry-and-repo-hq.md
