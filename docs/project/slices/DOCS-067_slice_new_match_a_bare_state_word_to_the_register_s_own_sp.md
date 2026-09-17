---
id: DOCS-067
state: ⬜ planned
title: "slice new: match a bare --state word to the register's own spelling"
est: S
doc: "[DOCS-067](slices/DOCS-067_slice_new_match_a_bare_state_word_to_the_register_s_own_sp.md)"
status: ""
---

# DOCS-067 — slice new: match a bare --state word to the register's own spelling

Minted with `slice new` itself, the first mint on this repository.

## The gap

`slice new --state planned` writes the bare word `planned`. A register whose legend spells states
with a glyph (`⬜ planned`, `🟨 coded`) then carries one row in a spelling it uses nowhere else.
Every check still passes, since a state is free text to the tool, but the register reads
inconsistently and a filter on `⬜ planned` misses the new row. Reported by a downstream consumer
verifying the command, whose instructions now say `--state "⬜ planned"` as a workaround.

When `--state` is omitted, the default already copies the register's spelling. The gap is only an
explicit bare word.

## Fix, when picked up

- **Match a bare word to the one register value it names.** When `--state` is not a value any row
  uses, but exactly one state the register does use contains it as a word, write that value.
  `planned` becomes `⬜ planned`.
- **Refuse when it is ambiguous or unknown**, naming the values the register uses. A state no row
  has used may be deliberate, so allow it only with an explicit override flag rather than guessing.
- Test: a glyph legend with `--state planned` writes `⬜ planned`; an ambiguous word refuses with the
  candidates listed.
