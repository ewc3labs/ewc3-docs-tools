---
id: DOCS-088
state: ⬜ planned
title: a trailer cut off by a blank line is refused, not passed as zero trailers
est: S
doc: "[DOCS-088](slices/DOCS-088_a_trailer_cut_off_by_a_blank_line_is_refused_not_passed_as.md)"
status: ""
---

# DOCS-088 — a trailer cut off by a blank line is refused, not passed as zero trailers

Asked by a downstream lane after a commit's trailers went unread: "warn when a `Slice:`/`State:`
line falls outside the last-paragraph trailer block, and when a `Slice:` is a comma list".

## Measured before scoping

```text
message: body / blank / Slice: DOCS-085, State: tested / blank / Co-Authored-By: ...
fold --check-message      exit 0   "ok - 0 Slice: trailer(s)"
fold --check (history)    the lines are invisible - %(trailers) reads only the last paragraph

message: Slice: DOCS-085, DOCS-040
fold --check-message      exit 1   "Slice: DOCS-085, DOCS-040 names no slice document"
```

The first is a **silent pass**: git keeps trailers only from the message's last paragraph, so a
blank line between `State:` and `Co-Authored-By:` leaves the `Slice:` in the body. Every reader
built on git's parser - this one included - sees no trailers and reports success. The second was
already refused; only its message was wrong.

## The rule

**Refused, not warned.** A check that read nothing must not say ok - that is the exit contract, and
a warning on an exit-0 run is the green this toolkit exists to prevent.

- A **stranded trailer** is a `Slice:`, `State:` or `No-Slice:` line, starting in column 0, in a
  paragraph made **entirely** of `Key: value` lines that git did not parse as the trailer block.
  Each parsed trailer line cancels one candidate with the same key and value, last paragraph first.
- Not stranded, each tested as a legal lookalike: a wrapped prose line that begins `State: ...` in a
  prose paragraph; an indented line (a git continuation, a quote, a diff); a comment line; text
  below a scissors line; the subject.
- `--check-message` refuses each stranded line by name, with the remedy: remove the blank line.
- `fold --check` reports it per commit by the rule every trailer issue follows: an **error** for
  commits after `--since`, a **warning** in full history, which cannot be rewritten.
- `Slice: A, B` (comma, semicolon or space) is refused as "names more than one slice in one trailer
  - write one Slice: per line, each with its own State:"; a single unknown id keeps "names no slice
    document".

`DOCS-073`'s own test asserted the old behaviour - trailer-looking text outside the last paragraph,
exit 0. It now asserts both halves: not **read** as a trailer (the id is never looked up), and
refused as stranded.

## Limit

A paragraph mixing one `Slice:` line with prose is not a trailer paragraph to git or to this rule,
and is not flagged. Flagging any column-0 `Slice:` line was measured: it fired on this repository's
own history, on a wrapped prose line.
