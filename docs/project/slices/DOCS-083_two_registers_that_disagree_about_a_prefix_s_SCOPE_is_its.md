---
id: DOCS-083
state: ⬜ planned
title: two registers that disagree about a prefix's SCOPE is its own finding, not a contest
est: M
doc: "[DOCS-083](slices/DOCS-083_two_registers_that_disagree_about_a_prefix_s_SCOPE_is_its.md)"
status: ""
---

# DOCS-083 — two registers that disagree about a prefix's SCOPE is its own finding, not a contest

A downstream freeze probe went looking for a violation, found none, and turned up something neither
side was checking for: **the same prefix declared by two registers that disagree about what the
declaration means.**

```text
register A   OPS   scope "FROZEN at 08"   owner A      last used OPS-08   ids OPS-04 … OPS-08
register B   OPS   scope "repo-local"     owner B      last used OPS-001
```

One row says **ownership** — this series is mine, and it is retired. The other says **namespace** —
this prefix is local here, like `FIX`, and means nothing outside this repository. **Both cannot be
true**, and today nothing notices, because the numbers have not met yet.

They will. B's next three mints are `OPS-002`, `OPS-003`, `OPS-004` — and **`OPS-004` is `OPS-04`**.
Same prefix, same number, two repositories, differing only in how wide they write it. The arrival
date is B's third future mint.

## What the tool already does, measured

Pointed at both registers together, `contestedPrefixes` **reports `OPS` as contested**: the claims
are not *all* repo-local, so the pair is not the `FIX` case. And `normalizeId` compares in numeric
space, so `OPS-04` and `OPS-004` are already one id.

So the machinery is there. Two things are missing.

## 1. A disagreement is not a contest

"Contested" today means *two registers claim this prefix*. That is the right alarm for two
repositories both minting a global series. It is the **wrong description** here, where the actual
fact is sharper and more actionable:

> `OPS` is declared **owned** by one register and **repo-local** by another. One of those is wrong.

A contest is resolved by deciding **who owns it**. A disagreement is resolved by deciding **what
kind of thing it is** — and until someone does, the two registers are not even describing the same
object. It deserves its own disposition, and its own line in a generated registry, rather than being
folded into a count of contests.

## 2. Comparison is numeric, and padding is per register

`normalizeId` already does this, and it must stay that way in anything derived across repositories:

- **Never compare id strings.** `OPS-04` and `OPS-004` are one number in two paddings; a string
  comparison reports them distinct and clean, which is how a downstream census once reported 113 ids
  across 112 positions with no duplicates.
- **Never normalise to one width first.** Padding is declared **per register** (`series.widths`),
  and two registers legitimately differ. Parse the number and compare that.

## Tests

- two registers declaring one prefix, one `owned` and one `repo-local`: reported as a **scope
  disagreement**, naming both registers and both spellings, distinct from a contest;
- both declaring it `repo-local`: not reported, which is the `FIX` case and correct;
- both declaring it global: reported as a contest, as now;
- a 2-wide and a 3-wide register writing the same number: their ids compare equal.

## And a denominator the generated table must not blur

A coverage number invites the wrong reading unless it separates two very different absences.
Measured downstream, across one estate's repositories:

- **no repository that has a register fails to declare.** Every planning surface that exists
  declares its prefixes;
- the repositories counted as "not declaring" have **no planning surface at all** — no
  `docs/project`, nothing to declare with.

Those are different facts and only one of them is the registry's business. "Declares nothing" must
therefore never be one bucket: a register that exists and declares nothing is a **defect**, and a
repository with no register is **out of scope** until someone gives it one. Reporting them together
produces a coverage percentage that understates the discipline and points at the wrong repositories.

The same rule as everywhere else here: **absent is not zero**, and a generated table says which.
