---
id: DOCS-073
state: ⬜ planned
title: "fold --check-message: validate a commit message's trailers before it is committed"
est: M
doc: "[DOCS-073](slices/DOCS-073_fold_check_message_validate_a_commit_message_s_trailers_be.md)"
status: ""
---

# DOCS-073 — fold --check-message: validate a commit message's trailers before it is committed

A commit tool and a `commit-msg` hook want to refuse a bad trailer **before** it is committed, not
have `fold` warn about it afterwards, when history can no longer be rewritten. There must be one
trailer grammar, so the check belongs here, next to the parser `fold` already uses, rather than
being reimplemented by each caller.

Two consumers asked for this independently: a commit command that writes and refuses trailers, and
the `commit-msg` hook that ships with it for IDE commits.

## Usage

```text
ewc3-docs fold --check-message <msgfile> [--staged] [--repo <dir>] [--config <file>]
```

`<msgfile>` is what git hands a `commit-msg` hook, usually `.git/COMMIT_EDITMSG`.

## What it checks

1. **The message, as git will store it.** Strip comment lines (`core.commentChar`, default `#`) and
   everything below a scissors line. Then run `parseTrailers` on the last paragraph, exactly as
   `fold` reads committed history:
   - `Slice:`/`State:` pairs, with each `State:` pairing with the nearest `Slice:` above it;
   - each id normalized, so `VS-4` and `VS-00004` are the same slice;
   - each `Slice:` names an existing slice document (live or archived);
   - each `State:` resolves through `resolveState`, with the same legend and the same ambiguity
     refusal.
2. **With `--staged`, the staged slice documents** (the DOCS-038 idea, at commit time). Staged paths
   come from `git diff --cached --name-status` only.
   - Every slice document added, modified or renamed must be named by a `Slice:` trailer.
   - A staged document whose frontmatter `state` **changed** must carry a `State:` for that slice
     resolving to the new value. The register and the history then agree from the first commit.
   - **Fold's own writes are exempt.** If a document's frontmatter diff touches only `state`,
     `state_sha` and `state_source`, and the new `state_sha` names a commit whose trailer gives that
     state, the commit is `fold --write` recording history, not a new decision. That is one
     `git show -s --format=%B <sha>` per such document, not a history walk.
   - Deleted documents are not checked; archiving is its own decision.

## Exemption: `No-Slice:`

```text
No-Slice: format sweep across the slice documents
```

This is a trailer in the same last paragraph, so it lives in history and can be reviewed. It is part
of the grammar, not a flag in the commit tool, so a hook and the commit tool honour the same thing.

- The reason is **required**. An empty `No-Slice:` is refused.
- It exempts `--staged` naming only. Every other trailer in the message is still checked.
- `No-Slice:` together with any `Slice:` is refused: a commit either names its slices or says why it
  names none. A partial exemption would hide the unnamed ones.
- `fold` ignores `No-Slice:` when folding history; it carries no state.

**Merge commits** need no trailer. With `MERGE_HEAD` present, `--staged` is skipped and the output
says so, because the merged commits were checked on their own branch.

## Exit contract

Same as every command:

| exit | meaning |
| --- | --- |
| 0 | accepted, **or nothing applies**, with a one-line reason: a rows register, no register, or no trailers and no staged slice documents |
| 1 | refused; every reason names the trailer line or the staged file |
| 2 | did not run: unreadable message file or config, not a git repository, a `planning` declaration the layout contradicts |

A rows register or no register exits **0 with its reason**, not 2, which is how `fold` already
behaves. Both requests proposed 2 here. The difference matters to an estate-wide hook: if "not
applicable" were 2, the hook would have to pass on 2, and a crash would pass with it. Keeping 2 as
"something is broken" lets the hook fail closed on 2 everywhere. Whether the hook refuses or only
warns on 1 is the hook owner's decision.

## Fast

No history walk. Reads: the message file, the roadmaps (for the legend), the slice directory's
filenames and frontmatter ids, one `git diff --cached` for `--staged`, and one commit message per
fold-written document. It never renders the index and never runs the index gate.

## Tests

- Valid pair, legend word, padded and unpadded id → 0.
- `Slice:` naming no document; unknown state; ambiguous state; `State:` with no `Slice:` above → 1,
  each naming its line.
- Trailer-looking text outside the last paragraph and commented or scissored lines → ignored, as git
  strips them.
- `--staged`: an unnamed modified document → 1 naming the file; a changed `state` with no or a
  different `State:` → 1; a fold-written diff whose `state_sha` trailer agrees → 0, and one whose
  trailer disagrees → 1.
- `No-Slice: <reason>` with unnamed staged documents → 0. An empty reason → 1. With a `Slice:` → 1.
- `MERGE_HEAD` present → `--staged` skipped, with the reason.
- Rows register / no register → 0 with the reason. Unreadable message file → 2.
- The parser is shared: one fixture message gives the same pairs through `--check-message` and
  through `fold` after committing it.
