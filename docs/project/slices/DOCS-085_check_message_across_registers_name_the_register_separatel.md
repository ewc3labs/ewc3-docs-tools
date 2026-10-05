---
id: DOCS-085
state: 🟦 tested
title: "check-message across registers: name the register separately, and an id owned elsewhere is not a refusal"
est: M
doc: "[DOCS-085](slices/DOCS-085_check_message_across_registers_name_the_register_separatel.md)"
status: ""
state_sha: c96fb05ca148
state_source: trailer
---

# DOCS-085 — check-message across registers: name the register separately, and an id owned elsewhere is not a refusal

A hub register owns a series whose work is committed in **other** repositories, so a commit-message
check running in one of those repositories has to validate the trailer against the **owning**
register, not the local one. Asked by the lane building a commit wrapper on `fold --check-message`.

## What already works, measured

`--check-message` takes a message **path** and `--repo` takes a **register root**, and they are
already independent. Run from inside the committing repository:

```text
A  hub-owned id, --repo <hub>          exit 0   ok - 1 Slice: trailer(s)
B  same message, no --repo             exit 0   "no register: ... trailers here are evidence only"
C  a third register's id, --repo <hub> exit 1   "Slice: DT-141 names no slice document"
```

So **A is the answer today — no new flag is needed for the trailer half.** B is the trap: run
locally in a repository with no register, the check passes everything and validates nothing. C is a
defect.

## Two gaps, both this toolkit's

### 1. An id owned elsewhere is refused, not reported

Case C: a commit can legitimately carry `Slice:` trailers for **two** registers — one for the hub's
series, one for the tool's own. Validated against either register, the other's id is refused as
*"names no slice document"*, which calls a correct commit invalid.

The fix is the one `DOCS-084` already specifies for the commit-list path, and it belongs here too:
**a prefix the register declares must name a document; a prefix it does not declare is `unowned`** —
reported by name and count, never refused. A typo inside an owned prefix is still caught, because
`VS` is owned and `VS-5291` names nothing.

**Changed while building — refused with the remedy, not reported.** Measured against a register,
"report, never refuse" lets a **typo of the prefix** through: `DCOS-40` for `DOCS-40` has a prefix
the register does not declare, exactly like a foreign id, and would have exited 0. Since `DOCS-040`
a foreign slice has an explicit form, `<registry>:<ID>`, so refusing a bare unowned prefix costs a
real citation nothing. The refusal now says which case it is:

```text
Slice: XY-141 - XY is not a prefix this register owns. If it is another register's slice,
qualify it as <registry>:XY-141; otherwise check the prefix for a typo
```

The hint fires only when the register declares prefixes and no document or archived id here uses
that prefix; otherwise the plain "names no slice document" stands. `DOCS-084`'s history path keeps
**reporting** unowned prefixes — history cannot be re-written to qualify, a message being composed
can.

### 2. `--staged` and the register root are the same flag, and must not be

`--staged` reads `git diff --cached` in whatever `--repo` points at. Point `--repo` at the hub to
validate a trailer, and the staged check reads the **hub's** index while the commit is being made
somewhere else. Measured, and it is worse than reading the wrong tree:

```text
staged in the API repo : src/app.js
staged in the hub      : an edit to VS-529's slice document that the message never mentions
fold --check-message --staged --repo <hub>   ->  exit 0
   "ok - 1 Slice: trailer(s), 1 staged slice document(s) checked"
```

It **passed**, and counted the hub's unrelated staged edit as checked, because the message happens
to name that slice. A green that attributes one repository's staged work to another repository's
commit is exactly the shape this toolkit exists to prevent.

So the two roots are separate things and get separate names:

```text
ewc3-docs fold --check-message <file> [--staged] [--register <dir>] [--repo <dir>]
```

- `--repo` stays **the repository being committed to** — it is what `--staged` reads, and what
  `MERGE_HEAD` is checked in;
- `--register <dir>` is **the register the trailers are validated against**, defaulting to `--repo`;
- `--staged` always reads `--repo`, never `--register`.

Built: a wrapper runs one invocation from the committing repository,
`fold --check-message <file> --staged --register <owning register>`. Pointing `--repo` at the hub is
no longer the way to reach another register, and with `--staged` it is the unsafe form above.

## Tests

- a message in one repository validated against another's register: the owned id passes;
- a bare trailer for a prefix the register does not declare is refused with the qualify-or-typo
  hint, and a missing number inside an **owned** prefix gets the plain message;
- `--staged` reads the committing repository's index even when `--register` points elsewhere;
- `--staged` with `--register` ≠ `--repo` never counts the register tree's staged documents;
- **an explicitly named register that has none exits 2**, and an implicit absence still exits 0 —
  both saying which location was looked at;
- `--register` defaulting to `--repo` leaves every current invocation unchanged.

## 3. An explicit pointer that resolves to nothing is an error

Case B exits 0 — *"no register: trailers here are evidence only"* — and for `fold` that is right: a
repository keeping its register as rows, or none at all, has nothing to fold, and `DOCS-073` chose 0
on purpose so a hook installed across an estate cannot be blocked by repositories that do not use
slice documents.

It is **wrong** for the cross-repo case, and the downstream lane put it better than I did: *"treat
'no register' as could-not-check, never a pass."* When a wrapper deliberately points at a hub's
register and that path is mistyped, un-cloned, or moved, the check validates **nothing** and reports
success — a silent pass arriving exactly when the configuration is broken.

The distinction is whether the register was **named**:

| invocation | no register found | exit |
| --- | --- | --- |
| no register root given — the local repository simply has none | not applicable | **0**, with the reason |
| `--register` given explicitly | the pointer is wrong | **2**, naming the path it looked at |

That keeps `DOCS-073`'s estate-wide hook working — it names no register, so it still exits 0 where
slice documents are not used — while a wrapper that *asked* for a specific register gets "did not
run" when that register is not there. Which is the exit contract already: 2 is for a check that
could not be performed, and a check with nothing to check against is one of those.

`--repo` needed nothing new: a mistyped `--repo` is not a repository and already exits 2. Also
refused (2): `--register` without `--check-message`, and `--staged` with a different `--register`
when the committing repository keeps slice documents of its own — they answer to it.
