---
id: DOCS-066
state: 🟦 tested
title: 'Frontmatter is written in a form strict YAML rejects, so GitHub shows an error on every migrated document'
est: S
doc: '[DOCS-066](slices/DOCS-066_Frontmatter_written_that_strict_YAML_rejects.md)'
status: 'plain only when strict YAML agrees; format re-quotes existing unsafe values without churning quoted ones; verified out-of-band with js-yaml, awaiting a downstream PyYAML gate'
priority: high
lane: frontmatter
---

# DOCS-066 — Frontmatter written that strict YAML rejects

GitHub renders a document's frontmatter as YAML. This tool reads and writes a **restricted subset**
of YAML with its own parser, and `field()` chose between plain and quoted output by round-tripping
through **that parser alone**. The subset is more lenient than YAML, so two shapes passed every
check here and broke on GitHub:

| written plain | this parser | strict YAML |
| --- | --- | --- |
| `doc: [VS-1](slices/x.md)` | the string | a flow sequence followed by garbage: **error** |
| `title: next <PREFIX>: print` | the string | a nested mapping: **error** |

Reported downstream: every document a migration had written was invalid YAML. This repository had 11
of 47 slice documents invalid, all titles. The committed `doc:` values here happened to be quoted,
by an earlier hand repair.

## Fix

- **`yamlPlain`**: plain output only when strict YAML reads back the same string. The rule is
  conservative, because a needless quote costs nothing and a missing one breaks the page. It quotes
  a value that is empty or has surrounding whitespace, starts with an indicator
  (`- ? : , [ ] { } # & * ! | > ' " % @` or a backtick), contains `: ` or ` #`, ends in `:`, or
  would be **retyped**: booleans and null in YAML 1.1 or 1.2, numbers, dates. Flow-list elements
  also exclude `, [ ] { }`.
- **`normalize`**, called by `format`: re-quotes only unsafe plain values in an existing block.
  Comment lines, field order, safe lines and already-quoted values in either style are kept
  byte-for-byte. The values must read back identically, or the block is left untouched. So an
  adopted repository is repaired with one `format` pass, and `format --check` reports unsafe
  frontmatter.

## Verified

- **Out-of-band, with js-yaml** (a scratch install; the tool stays dependency-free). On this
  repository, **11 of 47 invalid before, 0 of 47 after** one `fix` pass that changed only those 11
  title lines. On a `migrate-project --write` fixture carrying every unsafe shape, **8 of 8 invalid
  with `main`'s tools, 0 of 8** with the fix.
- **In the suite**, by shape, with no YAML dependency: every indicator and retype case is quoted and
  round-trips; safe values stay plain; list elements; migrate's `doc:` and a colon title;
  `normalize` keeps comments and is idempotent; `format` repairs and then passes `--check`;
  frontmatter already quoted in either style is never churned.

## Not built

- **A strict YAML parser in the suite.** Shapes are asserted instead, to keep zero dependencies. A
  shape the rule misses would pass here and fail on GitHub; the downstream PyYAML gate covers that.
