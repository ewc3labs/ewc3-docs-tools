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
5. **`next <PREFIX>` was deferred as DT-15** (*"only the +1 is manual"*).
   **Mint-that-creates-the-file is a different thing** — the file's existence is the reservation,
   which also removes the concurrent mint race. Justify it on that, not on `+1`.

[2026-08-24-llm-assis]: https://github.com/MedARMS/DevTools/blob/main/docs/design/2026-08-24_LLM_assisted_docs_and_PHI_boundary.md
[clerical-work]: clerical-work-belongs-to-ci.md
[ewc3-prefix-registry]: ../../../ewc3labs-hq/docs/project/EWC3_Prefix_Registry.md
[ewc3-prefix-registry-2]: https://github.com/ewc3labs/ewc3labs-hq/blob/main/docs/project/EWC3_Prefix_Registry.md
[llm-assisted-docs]: ../../../../../Programs_MedAR/DevTools/docs/design/2026-08-24_LLM_assisted_docs_and_PHI_boundary.md
[medar-phi-in-git]: ../../../../../Programs_MedAR/DevTools/docs/PHI_ANONYMIZATION.md
[phi-anonymization-md]: https://github.com/MedARMS/DevTools/blob/main/docs/PHI_ANONYMIZATION.md
[prefix-registry-and]: prefix-registry-and-repo-hq.md
