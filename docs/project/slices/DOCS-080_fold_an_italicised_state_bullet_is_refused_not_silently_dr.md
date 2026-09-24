---
id: DOCS-080
state: 🟦 tested
title: "fold: an italicised state bullet is refused, not silently dropped from the legend"
est: S
doc: "[DOCS-080](slices/DOCS-080_fold_an_italicised_state_bullet_is_refused_not_silently_dr.md)"
status: ""
state_sha: 45573ed8f500
state_source: trailer
---

# DOCS-080 — fold: an italicised state bullet is refused, not silently dropped from the legend

`DOCS-074` exists because a legend the reader could not fully read **shrank silently**. This is the
same failure one layer up: a legend it *can* read, shrunk by a formatting choice.

`readLegend` skips any bullet whose content starts with `_`. That is sound for a **reserved-state
note** — a register that writes ``- _`tested` … is **reserved** — …_`` means "this word is not a
state", and skipping it is correct. But italic emphasis is indistinguishable from that convention,
so italicising a **real** state bullet deletes it from the legend with no complaint, no unreadable
line and exit 0.

Measured downstream on two real registers: a register of eight states italicised one and read seven;
another of seven read six. Both exit 0. Every commit trailer using the vanished word is then refused
— `State: <word> is not in the legend (…)` — a red pointing at the **commit** while the fault is in
the **legend**, which visibly contains the word.

**The exposure is uneven.** A gate that asserts the canonical states as a floor catches a dropped
canonical word. A register that declares its **own** local state has no such net: drop it, and
nothing anywhere notices until every row carrying it fails.

## The discriminator

The two cases separate cleanly on the data, and the rule is: **a note has no glyph**.

```text
reserved note, skipped:     - _`tested` (unit + integration regression) is **reserved** — …_
italicised state, refused:  - _🟧 `blocked` — waiting on a dependency or a decision_
```

## Fix

- An underscore bullet carrying **a glyph and exactly one backticked word** is a state someone
  emphasised. It is **unreadable**: exit 2, naming the line and the word, as `DOCS-074` does for
  every other shape it cannot read.
- An underscore bullet with **no glyph** is a note, skipped exactly as now, so a reserved-state
  bullet keeps working untouched.
- Refusing rather than reading the word is deliberate. Stripping the emphasis and accepting it would
  guess at intent, and the spelling written into frontmatter would then carry underscores into every
  row.

## Tests

- A register with an italicised state: exit 2 in dry run, `--write` and `--check`, naming the line;
  nothing is written.
- The reserved-note bullet is still skipped, and the legend keeps every real state.
- A note with a glyph but no backticked word (`- _⚠️ these are legacy_`) stays a note.
- The state a real register would lose is named in the message, so the reader is not sent to the
  commit.
