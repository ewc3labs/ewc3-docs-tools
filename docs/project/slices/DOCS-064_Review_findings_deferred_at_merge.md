---
id: DOCS-064
state: ⬜ planned
title: 'Review findings deferred when the index gate and legacy-document migration merged'
est: M
doc: '[DOCS-064](slices/DOCS-064_Review_findings_deferred_at_merge.md)'
status: ''
priority: medium
lane: index
---

# DOCS-064 — Review findings deferred at merge

PRs #6 (`DOCS-056`) and #7 (`DOCS-062`) were reviewed by Codex in more than a dozen rounds. Every
round found something, and most of it was real. Rounds stopped converging well before findings
stopped arriving, so the merge was decided by judgement rather than by an empty review (Wilson,
2026-09-17: *"Don't let Codex astronaut."*).

## The merge bar

A finding **blocks** a merge when normal use can **silently destroy something a person wrote**. It
**waits** when it is loud (a false failure, a reported broken link), when it is a coverage gap (a
file not checked), or when it needs an input contrived enough that nobody meets it by accident.
Every blocking finding was fixed before merge. These eight were not:

| # | PR | severity | finding | why it waited |
| --- | --- | --- | --- | --- |
| 1 | #6 | P1 | A renamed row with a cell **blanked** passes the new-row exemption, so `--write` restores the blanked text | needs a rename, a deliberate blank and a document edit together; text comes back, none is destroyed |
| 2 | #6 | P2 | The formatted form is recorded in the last-written record even when the roadmap's definitions prove `format` did not produce it | needs a hand edit to exactly the hypothetical formatted spelling, without its definition |
| 3 | #6 | P2 | With several roadmaps owning disjoint ids, `--check` reports each roadmap's documents as unknown in the others | loud: a false failure, never a false pass; a single-register repo is unaffected |
| 4 | #7 | P2 | `links` (and `format`'s globs) still read `.md` case-sensitively, so a retained `.MD` document is never link-checked | a coverage gap; nothing is lost |
| 5 | #7 | P2 | A document backed up to `slices/_legacy/` keeps its relative links, which now point one directory too deep | prose preserved; `links` reports the breakage after adoption |
| 6 | #7 | P2 | A roadmap narrative backed up to `_legacy/` keeps relative links and loses the reference definitions it used | the same: prose preserved, breakage reported |
| 7 | #7 | P2 | A backup filename with a space, `)` or `#` is interpolated into the generated link unescaped | the link is malformed; the prose and the backup are intact |
| 8 | #6 | P2 | Several documents per id are refused outright (raised by the downstream census, not Codex) | a model question, recorded as open in `DOCS-062` |

Row 8 is a design decision, not a defect, and belongs to `DOCS-062`. It is listed here only so this
table is the one place to look.

## Fix, when picked up

- **1:** the exemption should treat a cell emptied relative to *any* committed row with the same
  position, or refuse any no-history row whose id replaced a committed one.
- **2:** record the formatted form only when `asFormatted` held for that write.
- **3:** compute `unknown` across the union of roadmaps, and report each document once.
- **4:** one shared markdown-extension rule for every reader (`index`, `links`, `format`,
  `migrate`).
- **5, 6:** reuse `definitionsFor(..., deeper)`, which already repoints relative targets and carries
  definitions for generated slice documents. Apply it to both kinds of backup.
- **7:** emit backup links in the angle-bracket destination form, or percent-encode the path.

## The lesson worth keeping

A hand-rolled parser invites an unbounded review. The six-round reference resolver on #6 ended by
**deleting** the parser, not finishing it. When a finding class keeps recurring, the fix is usually
to stop parsing, not to parse harder.
