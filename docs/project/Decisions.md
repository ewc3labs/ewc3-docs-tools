# Decisions

Decisions this repository needs from its owner, each with a number that is **never reused**. Answer
one by its number ("W-3: yes"). A decided entry stays here with its answer and date; it is never
renumbered, deleted or rewritten, so a number cited anywhere keeps meaning one thing.

The next number is derived, not kept by hand: the `W` row in the [roadmap's ID
Prefixes][roadmap-s-id] reads the highest `W-` id in this table, and CI fails if it is stale.

**What is and is not enforced, measured:** adding `W-6` without refreshing the marker fails CI. But
**writing an existing number a second time passes every check today** — the maximum does not move,
so nothing notices. Until `DOCS-030` (an id declared twice inside one repository) is built, "never
reused" is this page's rule rather than the tool's. Take the next number from the ID Prefixes row,
never from memory.

| ID | Status | Decision | Recommendation | Asked | Answer |
| --- | --- | --- | --- | --- | --- |
| W-1 | Open | Where does the cross-repository prefix registry run: a workstation, or HQ CI? | Workstation first | 2026-09-25 | |
| W-2 | Open | Should a converted register's Last Used cell be emitted by the tool rather than declared? | Yes, from slice documents plus the archive | 2026-09-25 | |
| W-3 | Open | After DOCS-040, which comes next: DOCS-085 or DOCS-084? | DOCS-085 | 2026-10-03 | |
| W-4 | Open | Who writes the Windows installer for rtk in the token-optimizer fork? | LabsHQ | 2026-10-03 | |
| W-5 | Decided | Which slice is built next, after DOCS-082? | DOCS-040 | 2026-10-03 | DOCS-040 — 2026-10-03 |

## W-1 — where the prefix registry runs

The registry is a generated table of which repository owns which ID prefix, built by reading every
repository's own register. Nothing about it needs CI to be correct; the question is only where it
runs as a gate.

- **HQ CI** reaches every repository in one organisation and could fail a pull request that claims a
  prefix someone else owns.
- **A workstation** with local clones certainly works today. Actions minutes are a live constraint,
  and the estate's roll-ups already run on demand for that reason.

**Recommendation: workstation first.** Build the command to run anywhere; CI is then one workflow
file away, added when the cost is worth it. **Blocks:** building the registry.

## W-2 — a tool-emitted Last Used cell

This repository already does it: its own Last Used cells are `<!--ewc3:lastDOCS-->` markers that
`values` derives and CI checks. The question is whether converted registers should do the same and
stop declaring the number by hand.

**Recommendation: yes**, with two conditions measured this week. Derive the high-water mark from the
slice documents (frontmatter, filename as fallback) **and `docs/_ARCHIVE`** — from `slices/` alone
an archived number gets minted again. And keep the padding width declared in config
(`series.widths`), because a generated cell is an output and the width is an input. **Blocks:**
nothing urgent; it decides the final shape conversions aim for.

## W-3 — the queue after DOCS-040

- **DOCS-085** (est M): `fold --check-message` validates against a named register, and an id owned
  by another register is reported rather than refused. A commit wrapper uses `--check-message`
  today, and DOCS-085 closes a measured trap where `--staged` against a foreign register passed work
  from the wrong repository.
- **DOCS-084** (est L): `fold --commits-from` folds trailers committed in other repositories. Its
  consumer has said there is no rush.

**Recommendation: DOCS-085 first**: smaller, and it fixes a false green in a tool already in use.

## W-4 — the rtk Windows installer

The four Windows defects in the token-optimizer extension are fixed in a pull request from the
LabsHQ fork. The fifth — a real Windows installer for rtk — is unclaimed. Its design is settled: the
release publishes a Windows zip and a checksum for it, extraction must call
`%SystemRoot%\System32\tar.exe` by absolute path, and arm64 has no asset so it must refuse by name.

**Recommendation: LabsHQ.** They own the fork and have both pull requests in flight; this lane would
review. **Blocks:** nothing in this repository.

## W-5 — the slice after DOCS-082 *(decided)*

Answered 2026-10-03: **DOCS-040**, qualified references across registers.

[roadmap-s-id]: EWC3_Docs_Tools_Roadmap.md#id-prefixes
