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
implements:
parent:
---
```

> **`followers:` is NOT in that block, and that is a correction** *(codex)*. Every field here is by
> definition a declaration, so including `followers` would make **both halves of one edge
> independently authored** — `A.depends_on: [B]` could then disagree with `B.followers: [A]`, which
> corrupts exactly the Ready/Blocked projections the graph is for. The companion design already
> requires edge symmetry to be **derived**: *"Do not make a human write both halves — that is the
> same fact stored twice, which this document exists to abolish."* One direction is authored;
> the reverse is generated.

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

## Every ID gets a document, and most are five-line stubs

**Costed by EPQE, who had the numbers: ~39 IDs and two slice documents.** `FIX-3` is a real ID that
deserves a changelog line and nothing more, so "one document per ID" sounded heavy. Three ways out:

| | | |
| --- | --- | --- |
| 1 | every ID gets a document | uniform, heavy for `FIX-3`'s kind |
| 2 | rows for small work, documents for real slices | ⛔ **reintroduces two declaring surfaces** |
| 3 | every ID gets a document, most are **five-line stubs** | ✅ |

**Option 2 is the trap**, and it is the shape this whole document exists to remove: the moment small
work lives in a row and real work lives in a document, there are two places a thing can be declared
and the parser is back to guessing which.

**A stub is cheaper than a row**, because a row carries the row *plus* the standing obligation to
keep it in step with whatever it describes. And it keeps the rule uniform — *a rule with an
exception is a rule somebody has to remember the exception to*, and the requirement here was that
none of us can forget a step.

### Which answers `DT-15`, parked since it was minted

`DT-15` (`next <PREFIX>`) sits at *"not yet earned — derived Last Used already removed the state
that could go stale; only the `+1` is manual."* Under this model the `+1` stops being read off a
register cell at all:

```bash
ewc3-docs slice new VS "Two writers own MFM.Doctors"
#   docs/project/slices/VS-00398_Two_Writers_Own_MFM_Doctors.md
#   number is max(existing filenames) + 1
```

**One command, one edit, one `fix`.** Deriving the next ID from the files that already exist is the
same move `Last Used` made, applied to the last input still read by hand — and a stub then costs one
command rather than one act of remembering.

### ⚠️ Sequencing: this model WIDENS `DT-30` before it closes it

`DT-30` — a same-repo duplicate declaration is undetectable — is **still live, and the two-surface
design makes it likelier.** Measured by EPQE and reproduced here: a `VS-7` Delivery Index row beside
a `` 3. `VS-7` - a different thing `` backlog item in one repository reports *"Every prefix in use
is declared"* and **exits 0**.

Under frontmatter-as-declaration it closes **structurally** — two documents cannot carry the same
`id:` without one file overwriting the other. **So `DT-35` should land before anything that adds a
third declaring surface**, or the window widens again with nothing watching it.

## Open questions

1. ✅ **SETTLED — the slice document is the authority.** *(Wilson, 2026-09-02; see [One thing to
   edit][one-thing].)* The Delivery Index is emitted from slice frontmatter.

   **Codex was right that deferring this made the rule unimplementable, not merely undecided.** When
   both a roadmap row and a slice's frontmatter carry the same ID, structure alone cannot say which
   is the declaration: scanning both reports every projected slice as a duplicate, and excluding
   either hard-codes the direction anyway. "Works in either direction" was true of the *structure*
   and false of the *checker* — a distinction I collapsed. It is a prerequisite for `DT-35`, and it
   now has an answer.
2. **Does the roadmap's Delivery Index still declare IDs?** If slice docs become authoritative, the
   register declares *prefixes* and the Delivery Index becomes a view. If the roadmap stays
   authoritative, its Index is the declaring position and slice-doc frontmatter is the projection.
   Same fork as 1, stated where it bites.
3. ✅ **ANSWERED — GitHub renders frontmatter as a visible key/value table.** *(Labs, 2026-09-02;
   independently re-measured here on a second specimen.)* The `values` doctrine holds and this
   proposal survives.

   Measured against GitHub's own renderer, which is authoritative because it *is* the renderer:

   ```bash
   gh api repos/github/docs/contents/content/get-started/index.md \
     -H "Accept: application/vnd.github.html"
   ```

   The **first** element inside `markdown-body` is the frontmatter, as a table:

   ```html
   <markdown-accessiblity-table><table>
     <tr><th>title</th><td>Get started with GitHub documentation</td></tr>
     <tr><th>shortTitle</th><td>Get started</td></tr>
     <tr><th>redirect_from</th><td><table>…nested…</table></td></tr>
   ```

   So a reader with no tooling sees every key and value **above the prose** — exactly what
   `**State** validated · runtime` gives today. A list such as `depends_on: [VS-00352]` renders as a
   nested one-row sub-table: visible, if slightly ceremonious.

   > ⚠️ **METHOD WARNING, and it is the more useful half.** Labs asked two page-fetches first and
   > **both reported that frontmatter is hidden and the document begins at the first heading. Both
   > were wrong.** A fetch-and-summarize layer describes the article's *prose* and discards the table
   > as chrome — an instrument answering truthfully about the wrong property, which is the shape this
   > entire review round has been about. Go to `Accept: application/vnd.github.html`.
   >
   > Also: do **not** test with `.github/ISSUE_TEMPLATE/*.md`. GitHub special-cases those elsewhere
   > in its UI, so they are not a fair specimen even though they happen to render correctly. The
   > verification above deliberately used an ordinary content file instead.
4. ⚠️ **TWO DOCUMENTS IN THIS BRANCH DISAGREE ABOUT WHETHER THE EMITTED SLICES ARE COMMITTED**, and
   the tree settles it. [The slice document is the object][slice-object] states at `:295` and `:461`
   that *"383 slice documents are already committed"*. **Measured on SX_Coder today:
   `git ls-files docs/project_v2` returns 0, and `git check-ignore` exits 0 — untracked and
   ignored.** Same result across all five repositories holding a preview, measured twice a week
   apart. So the migration below is a regeneration, and the companion doc's claim is stale rather
   than this one being optimistic. Raised by codex, who reasonably trusted the document over the
   tree — which is its own argument for deriving claims about build state (`DT-22`).
5. **Migration cost for the 400 already-emitted slice documents.** They are gitignored previews and
   the emitter is ours, so this is a regeneration rather than an edit — but it is only free while
   they stay unadopted, which is what the estate freeze is currently protecting.

[one-template]: one-template-beats-three-parsers.md
[one-thing]: one-thing-to-edit.md
[slice-object]: the-slice-document-is-the-object.md
