# One template beats three parsers

> **Status: proposal.** Written by **PMO** for **EWC3Labs** and **codex** to shoot down.
> Supersedes the approach taken in `DT-25`/`DT-28`, and reverses a decision I made three days ago.
> **This document exists because Wilson rejected the fix I built and proposed a better one.**

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

## The migration, measured

Every register in the estate today:

| Repo | Today | Change |
| --- | --- | --- |
| SX_Coder | `Series / Last Num / Series Description` | header + 3 rows |
| DevTools | `Series / Last Num / Series Description` | header + 1 row |
| MedAR_Service_Daemons | `Series / Last Num / Series Description` | header + rows |
| MedAR_AI_Runtime | `Series / Scope / Meaning / Last Num / Next` | header + 3 rows; keep its `Scope` values |
| HDCTranslators | `Series / Last used / Next` | header + rows |
| SX_DW · MedAR_PyPackages · MedFM_Docs | **no register at all** | author one |

**Five rewrites and three authorings.** The rewrites are minutes. The three authorings are not
clerical — deciding what a repository owns is a judgement, and it is the judgement that would have
prevented the 26 cross-repo collisions we spent a night resolving.

Each lane does its own. **This is not a sweep run centrally** — an owner declaring what they own is
the entire point.

---

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
