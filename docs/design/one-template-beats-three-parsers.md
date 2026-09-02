# One template beats three parsers

> **Status: proposal.** Written by **PMO** for **EWC3Labs** and **codex** to shoot down.
> Supersedes the approach taken in `DT-25`/`DT-28`, and reverses a decision I made three days ago.
> **This document exists because Wilson rejected the fix I built and proposed a better one.**

> ### ⚠️ CORRECTED 2026-09-02, after the branch was pushed
>
> The first version of this document called the MedAR registers *"five registers in three
> shapes"*, as though they were drift. **They are not.** `| Series | Last Num | Series
> Description |` **is** the canonical MedAR template, and three repositories are conforming to
> it. I proposed replacing a canon I had not read, which is the same defect this toolkit exists
> to catch — a claim about the estate that nobody re-derived. Wilson caught it in one line.
>
> The template lives at `_MedAR_ProjectSummary/templates/docs/project/template_project_roadmap.md`
> and is consumed by the `medar-project-roadmap` skill. **The choice below is therefore a
> two-way convergence between two live canons, not a migration of stragglers onto one.**

---

## The decision that prompted it

> *"We don't have to be super complicated about prefix tables we added by hand to the beginning of
> MedAR roadmaps, nor add automated tooling. We decide what the new roadmap template should look
> like and we force each legacy roadmap to match that template before we can run any conversion
> toolkit on it. It'll take 5 minutes to freshen up the roadmaps."* — Wilson, 2026-09-02

## What I had built, and why it was wrong

`ewc3-docs series` could not read a single MedAR register. I taught it to read all three shapes it
found in the wild: a `Series` header as a peer of `Prefix`, a mint template (`` `AIR-NN` ``) in the
first cell, and a prefix hiding inside a `Last Num` cell.

The argument I defended it with was: **a scanner whose correctness depends on the estate already
being migrated cannot audit the estate as it is — which is the only place drift lives.** Another
lane conceded it. It reads well.

**It rests on an unexamined premise: that migrating is expensive.** It is a header row. Those tables
were hand-added a few weeks ago; they are not a legacy corpus, they are a first draft. The honest
cost is below.

Which makes the trade plainly bad:

| | one template | three parsers |
| --- | --- | --- |
| cost, once | ~5 min × 8 repos | ~90 lines of parsing |
| cost, ongoing | none | every new shape is a new branch, forever |
| failure mode | a repo fails until fixed, loudly | a shape nobody anticipated fails **silently** |
| what a stranger sees | one documented shape | whichever of three we happened to meet |

The third row is the one that matters. **A parser that accepts three shapes will quietly accept a
fourth it half-understands.** Refusing is a check; accommodating is a guess.

---

## The canonical template

Already in use, unchanged, by **all four** EWC3 Labs repositories that have a register. This
proposal adopts it estate-wide rather than inventing anything.

```markdown
## ID Prefixes

**Read this before minting an ID.**

| Prefix | Scope | Owner | Last Used | Series |
| --- | --- | --- | --- | --- |
| VS | global | SX_Coder | <!--ewc3:lastVS-->VS-421<!--/ewc3:lastVS--> | vertical slices |
| FIX | repo-local | SX_Coder | <!--ewc3:lastFIX-->FIX-100<!--/ewc3:lastFIX--> | small corrections |
| OPS | frozen at 8 | MedAR_AI_Runtime | <!--ewc3:lastOPS-->OPS-8<!--/ewc3:lastOPS--> | retired; mint `AIR` |
```

**Five columns, and each earns its place:**

| Column | |
| --- | --- |
| `Prefix` | the bare prefix. **Not** `` `VS-NN` `` — a mint template in an ID position is the same defect as an ID in a prose position |
| `Scope` | `global` · `repo-local` · `repo-owned` · `frozen at N` |
| `Owner` | the repository that mints it. For a `global` prefix this is the arbiter the estate has never had |
| `Last Used` | **derived**, between `ewc3` markers. Never hand-maintained — that cell is the *input* to minting, so a stale one hands out a taken number |
| `Series` | what the prefix is for, in one line |

**`Scope` is the column MedAR invented and Labs should adopt.** `frozen at N` came out of
MedAR_AI_Runtime retiring `OPS` — and it is the one value that turns a convention into a control,
because minting past the ceiling can then fail. `repo-owned` is the honest third answer between
`global` and `repo-local`: one repository owns a globally-unique prefix.

**`Last Used` being derived is the whole thesis of this toolkit**, and it is the one column no MedAR
register currently has. Three of them hand-maintain the number that governs the next mint.

---

## Where an ID may be MINTED

Independent of the register's shape, and this part survives the reversal — it is about structure,
not spelling.

> **An ID is minted where it appears in a DECLARING position inside a PLANNING SURFACE, and merely
> cited everywhere else.**

**Declaring positions:** a Delivery Index row's first cell · a `### VS-07` section heading · a
backlog item's leading backticked token.

**Everything else is a citation** — prose, `depends_on`, survey output, a skill file's teaching
example, a register's Series Description.

Two measured reasons this must be definitional rather than a blocklist:

- A survey document quoting other repos' roadmaps carried **532 free-text IDs and zero
  declarations.** Documents that *describe* the estate are permanently full of IDs that are not
  mints, and there is no list of document classes that keeps up.
- A backlog written as a numbered list hid **four genuine cross-repo collisions** from every
  extractor in the estate, because they all keyed on table position.

**Corollary, adopted from SX_DW:** a backlog item carries **no minted ID**. New intake gets a
kebab-case slug; an item continuing a committed slice cites that slice **in prose**, never in the
leading position. A backlog item is intake, not a commitment.

---

## What the tool stops doing

If the template is enforced, these accommodations are dead weight and should come out before this
branch merges:

| Remove | |
| --- | --- |
| `Series` as a peer header | `Prefix` only |
| mint templates in the first cell | a bare prefix only |
| prefix extraction from `Last Num` | the first cell declares, or nothing does |

| Keep | |
| --- | --- |
| declaring positions (list items, headings) | structural, not a register shape |
| `Scope` column incl. `frozen at N` | part of the new template |
| repository-scoped declaration | a backlog inherits its roadmap's table |
| the nested-roadmap glob | see open question 2 |
| zero-roadmaps-matched is a failure | silence and cleanliness must not look identical |

---

## Two canons, and the one that is actually authoritative

**MedAR already has a canonical roadmap template**, and it is not the shape this document first
proposed:

```text
_MedAR_ProjectSummary/templates/docs/project/template_project_roadmap.md
  ## Last Numbers
    ### Number Series
      | Series | Last Num | Series Description |
```

Consumed by the `medar-project-roadmap` skill when a planning folder is scaffolded. So the estate
sorts as **conformance and drift**, not as three equal shapes:

| Repo | Register | |
| --- | --- | --- |
| SX_Coder · DevTools · MedAR_Service_Daemons | `Series / Last Num / Series Description` | ✅ **conforms to MedAR canon** |
| MedAR_AI_Runtime | `Series / Scope / Meaning / Last Num / Next` | drifted — and its `Scope` column is the best idea in the estate |
| HDCTranslators | `Series / Last used / Next` | drifted |
| SX_DW · MedAR_PyPackages · MedFM_Docs | none | never scaffolded |
| **all four EWC3 Labs repos** | `Prefix / Scope / Owner / Last Used / Series` | ✅ **conforms to Labs canon** |

**Two live canons, each internally consistent.** The decision is which one absorbs the other, and it
was never a matter of dragging stragglers onto one shape.

### The template must change either way

**Measured:** `cictl reposync --check` on HDCTranslators — whose register is drifted — reports
`documentationChanged: false` and `documentationWritten: []`. It syncs repo metadata, STATUS,
`AGENTS.md` and workflows. **It does not sync roadmaps.**

So there is no mechanical propagation. Migration is:

1. **edit the template** — or every newly scaffolded repo is born in the old shape, forever; and
2. **each lane freshens its own roadmap** — minutes for the five that have one.

The three with no register are not clerical. Deciding what a repository owns is a judgement, and it
is the judgement that would have prevented the 26 cross-repo collisions. **Each lane does its own;
this is not a central sweep** — an owner declaring what they own is the entire point.

---

## Resolved: both canons live, and the lookup path is configuration

*(Wilson, 2026-09-02: "we could have templates in ewc3-docs-tools AND customized MedAR templates.
Where to look for templates and where to fall back to should be configurable.")*

**This answers questions 5 and 6 below by refusing the premise both share** — that one canon has to
defeat the other. The toolkit ships templates; a consumer overrides them; resolution is an ordered
list with the builtin at the end.

```json
{
  "templates": {
    "roots": [
      "C:/Programs_MedAR/_MedAR_ProjectSummary/templates",
      "<builtin>"
    ]
  }
}
```

MedAR keeps its register, its `## Last Numbers` heading and its scaffolding skill. Labs keeps
`Prefix / Scope / Owner / Last Used / Series`. A stranger who configures nothing gets the builtin,
which is the toolkit's existing bar: *every field has a working default.*

### ⚠️ Why this is NOT the thing that was just reverted

It looks like it. Both let the checker cope with more than one register shape. **The difference is
the only thing that matters here:**

| | `DT-25`/`DT-28` (reverted) | templates as config |
| --- | --- | --- |
| how the shape is known | **SNIFFED** — try `Prefix`, else `Series`, else mine the `Last Num` cell | **DECLARED** — the repo names its template root |
| shapes accepted per repo | any of three, whichever matched | exactly one |
| an unanticipated fourth shape | silently half-accepted | **fails** |
| where the shape is written down | in the parser | in a template file the humans already edit |

> **DECLARED BEATS SNIFFED.** A checker that is told the shape can still refuse everything else,
> which keeps *"refusing is a check, accommodating is a guess"* intact. A checker that guesses the
> shape has already given that up. The reverted work was not wrong to want more than one shape — it
> was wrong to **infer** which one it was looking at.

**And it inverts the dependency.** Today the parser hardcodes a shape and the estate must conform to
the tool. With template roots, the estate's own canon is the input and the tool conforms to it —
which is the right direction for a public tool serving a private estate, and is exactly what
question 6 was uneasy about.

### What it opens, and none of it is free

1. **The toolkit does not currently have a template concept at all.** It *validates*; it has never
   *scaffolded*. This adds a noun — and a reason for the tool to read files that are not the
   repository's own documentation.
2. **How does the checker learn a column's MEANING, not just its name?** A header row says
   `| Prefix | Scope | Owner | Last Used | Series |` but not which column is the ID, which carries
   the ceiling, which is prose. Candidates: position (first cell declares), the `ewc3` markers
   already in the template making `Last Used` self-identifying, or an explicit mapping beside the
   template. **This is the real design work and it should not be hand-waved.**
3. **Ordered roots are precedence, not ambiguity — say so.** This toolkit already holds that *two
   config files is an error, not a preference*. A resolution ORDER is a deliberate declaration and
   is fine; two templates of the same name in the same root is the ambiguity, and should fail.
4. **A template is now a dependency across repository boundaries.** MedAR's roots would point at
   `_MedAR_ProjectSummary`, so a checker in one repo reads a file in another. That is a real
   coupling: what happens on a machine where that path does not exist, or in CI?

## Answered by EPQE's review, 2026-09-02

The repository that has been dogfooding this toolkit all week ran the branch rather than reading it,
and settled four of the six. **Their answer to Q4 changes the plan, and reverses my instinct.**

### ⚠️ Q4 — `series` and `migrate-project` must point in OPPOSITE directions

I had guessed the migration gate belonged in `migrate-project`, since Wilson's rule is that no
conversion runs against an unmigrated roadmap. **Backwards.**

> *"`series` refuses — it is the everyday check and the gate, and that is what makes the migration
> happen. But `migrate-project` must **accept** the non-conforming shape, because converting it is
> the job. A converter that refuses what the checker refuses can never migrate anything."*

Obvious once stated, and it **relocates the reverted work rather than deleting it.** The three-shape
reading stripped out of `series` is exactly what a converter needs — and guessing is appropriate
there, because a human reviews the emitted diff before adopting it. `DT-34`.

| | `series` | `migrate-project` |
| --- | --- | --- |
| meets a non-conforming register | **refuses** — this is the gate | **reads it** — this is the job |
| may guess at a shape | never | yes; a human reviews the diff |
| where the reverted code belongs | — | ✅ here |

### Q1 — derived `Last Used`: **config as an opt-out, never an entry fee**

> *"The derivation is worth it; the requirement is the bug."*

The README promises most repositories need no configuration at all, and charging eight repos a
`.ewc3-docs.json` for a cell they already have contradicts it. **The register already declares its
prefixes, so derive `Last Used` for every declared prefix with zero config**, and let configuration
exist only to override. That removes the objection entirely.

### Q2 — **shape only, not location**

The glob already solved location, and this branch proved it by adding `docs/project/roadmap/`.
Pinning location moves files and breaks inbound links for something no parser needs.

### Q3 — **`frozen at N` stays parsed**, and it has already fired in anger

Cosmetic complaint taken: the scope cell was being upper-cased when frozen, turning
`global, frozen at 8` into shouting. Fixed — print what the register wrote.

### Q5 — the reversal is right, and the reason is sharper than mine

> *"It was not wrong because migration is cheap; it was wrong because the set of shapes is unbounded
> and nobody can see the ones they have not met yet."*

Three taught shapes, and a fourth — the unguarded heading — found by the first reviewer to run the
branch, in a parser three lanes had already read.

## Open questions

1. **`Last Used` requires a `values` config per repo.** Every prefix needs a `lastId` resolver and a
   `template`, so eight repos each grow a `.ewc3-docs.json`. Cheap, but it is the first time the
   toolkit *requires* configuration. Is a derived cell worth that, or does `Last Used` stay
   hand-written until `series` can derive it with no config?
2. **Do roadmaps have to move?** MedAR_AI_Runtime and SX_DW keep theirs in `docs/project/roadmap/`;
   Labs uses `docs/project/`. Moving files is more disruptive than editing a header. Does the
   template pin the *location*, or only the *shape*?
3. **`frozen at N` — parsed, or prose?** It is in the template above as a real value with a ceiling.
   If it stays prose, the freeze goes back to being a convention.
4. **What refuses a non-conforming register — `series`, or `migrate-project`?** Wilson's rule is
   that no conversion runs against an unmigrated roadmap. `migrate-project` is the conversion, so
   the gate probably belongs there rather than in the everyday check.
5. **⚠️ WHICH CANON WINS — the question this document originally begged.** Labs' `Prefix` shape
   carries `Owner` (the cross-repo arbiter the estate has never had) and a derived `Last Used`.
   MedAR's shape is simpler, is already in a real template with a real consumer, and is what three
   repositories and the scaffolding skill already produce. A third option is a merged shape — which
   is what §"The canonical template" describes — but that costs a template edit *and* eight
   roadmaps, and it should be chosen deliberately rather than inherited from whichever document got
   written first.
6. **Does `ewc3-docs` belong in this decision at all?** MedAR's template predates the toolkit
   reading it. A public tool that dictates the register shape of a private estate is the tail
   wagging the dog; a public tool that reads whatever the estate's own canon says is the position I
   just spent a commit reverting. Neither is obviously right.
