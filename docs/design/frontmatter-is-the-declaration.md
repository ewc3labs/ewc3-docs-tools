# Frontmatter is the declaration

> **Status: proposal.** Written by **PMO** for **EWC3Labs** and **codex** to shoot down.
> Companion to [One template beats three parsers][one-template]. That document decides the
> *register's* shape; this one decides where **anything** in this estate is allowed to declare
> **anything**, and deletes four parsers on the way.

---

## The one rule

> **A declaration is a field in the structured block at the head of a prescribed document.
> Nothing else in any document declares anything, ever.**

Headings do not declare. Bullets do not declare. Prose does not declare. A fenced example does not
declare. There is no separator to guard, no position to guess at, and no arbiter to consult.

## Why: every bug this week was the same bug

Three reviewers, three findings, one cause — **we were parsing prose we generate ourselves.**

| Found by | Symptom |
| --- | --- |
| codex | a fenced `1. \`VS-99\`` example set `lastId` to 99 **and** raised a false undeclared-prefix failure |
| EPQE | `### PQ-34 changed how the other repo publishes` registered as a mint, and told the repo to claim a prefix it does not own |
| PMO | requiring a separator on headings silently un-declared `DW-023`/`DW-024`, the exact IDs the heading rule was added to catch |

Each fix taught the parser one more shape. **The set of shapes is unbounded and nobody can see the
ones they have not met yet** — EPQE's line, and it is the whole argument.

Here is what the emitter writes today, which is the problem in miniature:

```markdown
# AIR-00001 — Runtime skeleton + local compose render (Phase 1)

## AIR-00001 — Runtime skeleton + local compose render (Phase 1)

**State** validated · runtime · [Build Roadmap §Phase 1](../../MedAR_AI_Runtime_Build_Roadmap.md)
```

The identity appears twice as a heading; the fields are **prose separated by `·`**. We generate
this. Every scanner written this week exists to guess at output we control.

## It is frontmatter, and we already proposed it

*(Wilson: "What we're really doing is reinventing frontmatter, aren't we?")*

Yes — and [The slice document is the object][slice-object] specified it months before this branch
started. A key/value table at the head of a document is frontmatter with the standard filed off:

```yaml
---
id: VS-00397
title: Two writers own MFM.Doctors — retire the second IBM i channel
state: coded
est: 4.0d
priority: high
lane: MedFM / Gateway / Caches
depends_on: [VS-00352]
followers: [VS-00398]
implements:
parent:
---
```

**Use the existing structure.** It is delimited by `---`, it is typed, it holds lists, every static
site generator understands it, and it is not something this estate has to invent or defend.

## Where each kind of structure goes

| Document | Structure | Why |
| --- | --- | --- |
| **slice doc** | frontmatter | one subject, N attributes |
| **module doc** | frontmatter + a member table | one subject, plus N rows of the same kind |
| **roadmap** | a prescribed **table** — the register | N rows of the same kind, and see below |

**The roadmap keeps a table, for two reasons that are not aesthetic.** A register is genuinely N
rows of one kind, which is what a table is for. And every MedAR roadmap opens with a
`<div align="center">` logo banner — frontmatter must be the *first* bytes of a file, so a roadmap
cannot have it without moving the banner in eight repositories for no gain.

## The cost, stated plainly: we must parse YAML, and we have no dependencies

`package.json` has **no `dependencies` key at all**, and that is load-bearing — the toolkit's
selling point is `npx` and go. The MedAR config is JSON rather than YAML for exactly this reason.

**So parse a restricted subset ourselves.** The frontmatter above needs only:

```text
key: scalar
key: [a, b]           inline list
key:                  block list
  - a
  - b
# comment
(empty value = null)
```

No nesting, no anchors, no multi-line scalars, no type coercion beyond string/list. **Roughly forty
lines, zero dependencies** — and anything a document needs beyond that subset is a signal the
document is doing too much, so **refusing it is a feature.** A frontmatter block this parser cannot
read should FAIL, loudly, not fall back to guessing.

## What it deletes

Everything below exists only to disambiguate prose, and every line of it has produced a defect:

| Removed | Added for | Broke |
| --- | --- | --- |
| the heading pattern | SX_DW's `### DW-023` | EPQE's false positive |
| the register-as-arbiter heading rule | fixing that false positive | added an hour before this doc |
| the list-item separator guard | Notes bullets citing siblings | the fix that hid `DW-023` |
| `parseHeading`'s range/multi-ID handling vs `DECLARING_POSITIONS` | two eras | they disagree today |

`withoutFences` stays — cheap, and a fenced example must never be read as content regardless.

**`DT-30` is also dissolved rather than fixed.** A same-repo duplicate declaration is currently
undetectable because two surfaces can both declare; with one declaring position per document, a
duplicate is two documents claiming one `id`, which is a set comparison rather than a heuristic.

## Open questions

1. **⚠️ WHICH DOCUMENT IS AUTHORITATIVE — and this proposal does not settle it.** [The slice
   document is the object][slice-object] says the slice doc is authored and the Delivery Index row
   is *generated*. Today it is the reverse: the roadmap is authored and slice docs are emitted.
   **The prescribed structure works in either direction**, but which block is *the* declaration and
   which is a projection depends entirely on that answer. It belongs to that proposal, not this one.
2. **Does the roadmap's Delivery Index still declare IDs?** If slice docs become authoritative, the
   register declares *prefixes* and the Delivery Index becomes a view. If the roadmap stays
   authoritative, its Index is the declaring position and slice-doc frontmatter is the projection.
   Same fork as 1, stated where it bites.
3. **Does GitHub still render frontmatter as a table?** The `values` doctrine holds that a reader
   with no tooling must see the value. Frontmatter is invisible in most renderers; GitHub is
   believed to render it as a table for `.md` files in a repository. **Unverified here — check
   before relying on it**, because if it does not, we lose the visibility that `**State** validated`
   currently provides.
4. **Migration cost for the 400 already-emitted slice documents.** They are gitignored previews and
   the emitter is ours, so this is a regeneration rather than an edit — but it is only free while
   they stay unadopted, which is what the estate freeze is currently protecting.

[one-template]: one-template-beats-three-parsers.md
[slice-object]: the-slice-document-is-the-object.md
