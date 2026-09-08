---
id: DT-52
state: ⬜ planned
title: 'The document modules do not know frontmatter exists, and `format` destroys it'
est: S
doc: '[DT-52][dt-52]'
status: '⛔ blocks the slice-document model — `fix` destroys frontmatter, a five-line stub corrupts SILENTLY, and `links` reports frontmatter values as dead links'
priority: high
lane: format
blocks: [DT-35, DT-41]
---

# DT-52 — `format` reflows frontmatter as prose, and `check` calls the wreckage correct

`lib/format.js` has **no frontmatter awareness at all**. It treats a `---` delimited block as
ordinary markdown and rewraps it, which collapses one-key-per-line frontmatter into wrapped prose
and destroys the document as a structured object.

## Measured, 2026-09-08, at `9b07f6d`

Authored `docs/project/slices/DT-51_*.md` with valid frontmatter, then ran `fix`:

```
before   id: DT-51
         state: ⬜ planned
         title: '`links` resolves cross-repo targets ...'

after    id: DT-51 title: '`links` resolves cross-repo targets from the worktree, not from the
         repository' state: ⬜ planned est: S doc: — status: cross-repo relative links resolve ...
```

Then, on the same file:

```
check   ->  "All 13 file(s) formatted correctly."          exit 0 for format
index   ->  Error: frontmatter line 3: not `key: value`    exit 1, uncaught throw
```

**`check` passes on a document `index` cannot parse.** Two tools in one toolkit disagree about the
same file, and the one CI runs is the one that says everything is fine.

## The vise

There is no state in which a slice document is both valid and CI-green:

| | `format --check` | `index` |
| --- | --- | --- |
| correctly authored | **fails** — wants to reflow | parses |
| after `fix` | passes | **crashes** |

So `fix`, the command the README tells everyone to run, is the command that breaks the model.

## Why it was never seen

**This repo had no frontmatter documents.** The `DT-51` slice document above is the first one, and
the specimen in [the-slice-document-is-the-object](../../design/the-slice-document-is-the-object.md)
is inside a fenced block, where `format` correctly leaves it alone. `DT-37` (`index`) shipped and was
exercised against slice documents in *other* trees. The defect has been latent since frontmatter was
specified and fires on first adoption — **in the repo that builds the tooling meant to migrate every
other repo to this shape.**

## Fix

`format` must treat a leading `---` block as opaque: preserve it byte-for-byte, format only the body
after it. A frontmatter block is not prose and has no line-width property.

Worth deciding in the same slice:

- **`index` should refuse, not throw.** An unparseable frontmatter block currently produces a raw
  node stack trace naming `lib/frontmatter.js:141`. `DT-27` already ruled the shape here — refuse
  loudly and name the file, rather than dropping or crashing.
- **`format --check` should say what would change** — this is `DT-2`, and this incident is a second
  argument for it: the failure named the file and not the reason, so the remedy it implied was "run
  `fix`", which is exactly the destructive action.

## Blast radius

Every repo adopting the slice-document model runs `fix` before its first `check`. On that run, every
slice document it just authored is corrupted, and `check` reports success.

## Severity, settled by review — the recommended shape is the silent one

EQPE asked the question that decides this: does `lib/frontmatter.js` **throw** on a collapsed block,
or silently return a garbage `id`? **Both, and which one you get depends on line length.**

The key regex is `/^([A-Za-z_][A-Za-z0-9_-]*)\s*:(.*)$/`, so a collapsed line still matches — the
first key wins and the rest of the document's fields become part of its *value*:

```
A. collapses to ONE line   ->  PARSED  {"id":"VS-00001 title: A slice document status: minted"}
B. collapses AND wraps     ->  THREW   frontmatter line 2: not `key: value`
C. correct                 ->  PARSED  {"id":"DT-51","title":"fine"}
```

**A long slice document throws loudly. A short one is corrupted in silence.** And the short one is
what this model asks for: *"every ID gets a document and most are five-line stubs."* Measured on a
real five-line stub, `fix` produced:

```
id: DT-53 state: ⬜ planned title: A five-line stub est: S doc: —
```

One key. `state`, `title`, `est` and `doc` are gone — absorbed into the value of `id`.

**What `index` then reports, measured, is the wrong diagnosis:**

```
1 document(s) claim an id this register never minted:
  DT-53 state: ⬜ planned title: A five-line stub est: S doc: —
```

It is caught, but as an *unminted id* — and the remedy that implies is **declare it in the register**,
which would write the corruption into the roadmap. Nothing says the document was destroyed.

**And `check` never runs `index`.** CI runs `check`, which reports `All N file(s) formatted
correctly`. So the corruption is invisible to CI, visible only to whoever runs `index` by hand, and
misdescribed when they do.

That is the same family as the `byId` last-wins Map one layer up: a real defect wearing the label of
a different, milder one.

## The fix framing, widened by review

LabsHQ made the argument that changes what gets built:

> `format`'s guarantee is *"never changes a word."* **It honoured that guarantee and destroyed the
> document anyway** — it only joined lines.

So the invariant is insufficient as stated. **In structured text, newlines are semantic.** Fenced
code blocks are already protected for exactly this reason, which means the mechanism exists and
frontmatter is the same class rather than a special case.

Write the fix as **"regions where a newline carries meaning are copied verbatim"**, then ask what
else belongs in that set — tables, list indentation, anything else `format` currently reflows. A rule
stated as *"add frontmatter awareness"* patches this instance and will not catch the next one.

**Dependency direction**, by LabsHQ's test — *DT-52 blocks anything that AUTHORS frontmatter
documents; it does not block anything that only READS them*: `DT-35` and `DT-41` author, so they are
blocked. `DT-37` (`index`) only reads, so it is **not** blocked and has been removed from the list.

**How to say the severity** (EQPE, and it is the right lead): this is **not a formatting bug with a
data consequence — it is a data-destruction bug wearing a formatting bug's error message**, in the
tool that is about to migrate every repo in the estate to the shape that triggers it.

## Wider than `format`: four modules do not know frontmatter exists

Found by adopting the model rather than by reading the code. With `doc:` carrying a
roadmap-scoped reference link — correct **as data**, since the definition lives in the register
where the cell renders — `check` reported two new failures:

```
docs/project/slices/DT-51_....md  ->  [DT-51][dt-51]   (undefined reference)
docs/project/slices/DT-52_....md  ->  [DT-52][dt-52]   (undefined reference)
```

**`links` is scanning the frontmatter block as prose**, finding markup in a field value and
resolving it in the wrong document’s namespace. Measured across the toolkit:

| module | requires `frontmatter.js` |
| --- | --- |
| `lib/slices.js`, `bin/ewc3-docs.js` | yes |
| `lib/format.js` | **no** — reflows it, destroying the object |
| `lib/links.js` | **no** — reports field values as dead links |
| `lib/values.js`, `lib/tables.js` | **no** — latent, no frontmatter documents existed to hit |

> **Only the two components that consume slice documents know the format exists. Every component
> that PROCESSES documents does not.**

So the slice is not *"`format` needs frontmatter awareness"* — it is that **frontmatter was
specified as a data format and the document pipeline was never told.** `format` is the destructive
instance and `links` the noisy one; `values` and `tables` are unexercised rather than safe.

This also sharpens the fix framing above. A rule written as *"`format` skips `---` blocks"* leaves
`links` broken, `values` and `tables` unexamined, and the next module written no wiser. The rule is
**a leading `---` block is structured data, not prose, for every module that reads a document.**

⚠️ **Live consequence, not hypothetical:** the two failures above are in this branch’s `check`
right now. They are recorded as DT-52 evidence rather than worked around, because the alternative
was to write a worse `doc:` value to satisfy a checker that is wrong — **changing correct data to
please a broken instrument**, which is the failure mode this register exists to catch.