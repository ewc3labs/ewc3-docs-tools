# Clerical work belongs to CI

> **Canon.** Written by **SXC** with MedAR's numbers, for **Labs** to hold us both to. Wilson:
> *"If we're manually handrolling updates and docs fixes and replacing links and updating numbers,
> we've lost."*

---

<!-- ewc3:effort:start -->
## 🧭 The effort — the same map, in every document

**Goal: stop hand-maintaining derived facts.** A slice is authored **once**, as a document. Every
list, roadmap row, status and per-repo evidence entry is **generated** from it. Local LLMs draft
what is judgement-adjacent; **deterministic code decides anything that matters**, and a human still
judges whether work is *done*.

| Document | Decides | Owner |
| --- | --- | --- |
| **Clerical work belongs to CI** | **the canon** — what is clerical, and the measurement that makes it urgent | Labs · ← **you are here** |
| [The slice document is the object][the-slice-document] | the authored authority — frontmatter, typed graph, git trailers, Ready/Blocked | Labs |
| [Prefix registry and `repoHQ`][prefix-registry-and] | cross-repo prefix ownership, generated rather than hand-synced | Labs |
| [EWC3 Prefix Registry][ewc3-prefix-registry] · [🔗][ewc3-prefix-registry-2] | who owns which ID series **today**; global by default, `FIX` repo-local | Labs HQ |
| [LLM-assisted docs & PHI boundary][llm-assisted-docs] · [🔗][2026-08-24-llm-assis] | **the lanes and the chat registry**, plus the shared invariants | MedAR |
| [MedAR PHI-in-git convention][medar-phi-in-git] · [🔗][phi-anonymization-md] | what may enter git; only *impossible* values are exempt | MedAR |

Cross-repo entries carry **both** links: the relative one resolves for an agent reading the
filesystem (both trees are cloned to the same paths on every machine), the GitHub one resolves on
the web. Same twin-link convention MedAR already uses.
<!-- ewc3:effort:end -->

## The rule

**CI tools do the CI things as a matter of course.** Every step in the loop below that is *clerical*
— deriving a number, keeping two files consistent, rewriting a link, restating the same fact in a
second repository — is the tooling's job, always, without being asked.

```text
observe something            human       -> punchlist item
reconcile to a slice         CLERICAL    -> mint the ID, write the row, punch the item, cite the slice
work it, write tests, test   human       -> the actual job
smoke it if tests cannot     human       -> judgement about what tests cannot reach
mark it done                 CLERICAL    -> state, evidence in every repo touched, numbers, links
```

The human steps are **observation and judgement**. Everything between them is bookkeeping, and
bookkeeping done by hand is bookkeeping done inconsistently.

## Why it is canon and not a preference: the numbers

MedAR, commits since 2026-07-01:

| Repository | Commits | Clerical | Share |
| --- | --- | --- | --- |
| `SX_Coder` | 342 | 76 | **22%** |
| `HDCTranslators` | 49 | 10 | 20% |
| `DevTools` | 112 | 13 | 11% |
| `SX_DW` | 84 | 8 | 9% |
| `SX_Coder_API` | 131 | 4 | 3% |
| `SX_Coder_UI` | 45 | 1 | 2% |

The pattern is not random: **the repositories that hold a roadmap pay the tax.** `SX_Coder` spends
more than a fifth of its commits on status entries, doc fixes and number updates. `SX_Coder_UI`,
which holds no planning surface, pays 2%.

That tax is not a sign of diligence. It is the measurable cost of clerical work that has no owner.

## The structural reason: a slice is cross-repo, every surface is per-repo

Slices touched since 2026-06-01:

```text
total                              278
spanning MORE than one repository  131   (47%)

VS-357   5 repos   API, HDCT, SX_Coder, SX_DW, UI
FIX-75   4 repos   API, HDCT, SX_Coder, SX_DW
VS-249   4 repos   API, HDCT, SX_Coder, UI
```

**Nearly half of all work spans repositories, and every surface that records it does not.** The
roadmap row lives in one repo, the punchlist item in another, and the STATUS evidence must be
written into each repo that was touched — the same fact, restated by hand, N times.

At 10+ interrelated repositories with 3–5 in play on a single slice, that is not an annoyance. It is
the reason state drifts: **each restatement is an independent opportunity to forget**, and
forgetting looks exactly like nothing having happened.

This is also why the drift is *worst* in the hub. `SX_Coder` is where the fan-out starts.

## What follows from it

**1. Anything derivable must be derived, never stored twice.** Last-used IDs, prefix ownership, test
counts, version strings. A cached copy of a derivable fact is a drift generator with a maintenance
schedule.

**2. Cross-repo facts need one authority and N generated projections.** A slice is one object. Its
row, its punchlist citation and its per-repo evidence are *views*. Humans should edit the object;
tooling should write the views.

**3. Every check runs by default, or it does not exist.** A check behind a flag is a check nobody
runs. The loop above has no step called *"remember to run the tools"* because that step always
eventually stops happening.

**4. Idempotent, always.** Running the tooling twice must be indistinguishable from running it once.
Bookkeeping automation that is not idempotent cannot be run automatically, which returns it to a
human, which is where we started.

**5. Softcode the surface, but not into a maze.** Enough configuration that a repository can say
what is genuinely different about it; not so much that the config becomes a second thing to
maintain. The existing bar is right: *every field has a working default, and declaring a default
back to the tool is noise that later reads as deliberate divergence.*

## The honest boundary

**Automation replaces the clerk, never the judge.** These stay human, permanently:

- deciding a punchlist item is understood well enough to become a slice — the receipts gate;
- deciding a slice is *done*, as opposed to merely committed;
- deciding that a manual smoke was needed because tests could not reach it;
- adjudicating the state of work nobody recorded — which no tool can reconstruct, only *report on*.

Tooling should make each of those decisions **cheap to record and impossible to forget**. It should
not make them.

## Why this is getting more urgent, not less

SX_Coder is on its way to being an RCM operating system; EWC3 Labs keeps adding repositories. Both
directions multiply the same tax — more repos per slice, more surfaces per fact, more restatements
per decision.

The clerical share is a leading indicator. If it is not falling as the tooling improves, the tooling
is not doing the CI things as a matter of course, whatever else it is doing.

[2026-08-24-llm-assis]: https://github.com/MedARMS/DevTools/blob/main/docs/design/2026-08-24_LLM_assisted_docs_and_PHI_boundary.md
[ewc3-prefix-registry]: ../../../../ewc3labs-hq/docs/project/EWC3_Prefix_Registry.md
[ewc3-prefix-registry-2]: https://github.com/ewc3labs/ewc3labs-hq/blob/main/docs/project/EWC3_Prefix_Registry.md
[llm-assisted-docs]: ../../../../../Programs_MedAR/DevTools/docs/design/2026-08-24_LLM_assisted_docs_and_PHI_boundary.md
[medar-phi-in-git]: ../../../../../Programs_MedAR/DevTools/docs/PHI_ANONYMIZATION.md
[phi-anonymization-md]: https://github.com/MedARMS/DevTools/blob/main/docs/PHI_ANONYMIZATION.md
[prefix-registry-and]: prefix-registry-and-repo-hq.md
[the-slice-document]: the-slice-document-is-the-object.md
