---
id: DOCS-090
state: ⬜ planned
title: "fold --format json: a versioned, published schema so wrappers never parse English"
est: M
doc: "[DOCS-090](slices/DOCS-090_fold_format_json_a_versioned_published_schema_so_wrappers.md)"
status: ""
---

# DOCS-090 — fold --format json: a versioned, published schema so wrappers never parse English

A CI wrapper around `fold` read its text: one regex on the `ok -` line of `--check-message`. Every
rewording of a message is then a silent break in someone else's tool. The owner asked for the output
to be machine-readable and machine-written, with **contract versioning and a place to store the
schema**.

## Built

- `fold --format json` in every mode: dry run, `--write`, `--check`, `--check-message`, and with
  `--commits-from`. One document on stdout; exit codes unchanged; `ok` equals exit 0.
- **The schema is a file**, `schema/fold.v1.schema.json` (JSON Schema 2020-12), shipped in the npm
  package. Its `$id` is a stable URL, and every document names it with
  `"schema": "ewc3-docs/fold@1"`.
- **Versioning:** additive within v1; a rename or removal is v2, published beside v1, never over it.
- **Stable codes, set where each problem is raised.** Every problem in `lib/fold.js` is built by one
  constructor, `problem(code, message)`, at the place it is detected. There is no classifier reading
  the messages afterwards - that would be a second reader of this tool's English, the thing this
  slice removes.
- **Did not run is JSON however early it happens:** an unknown flag, an unreadable config, a missing
  commit list or a crash. A caller never falls back to text.
- `from` is `null` for a slice's first state, so a consumer can tell "new" from "moved".
- The text output is byte-for-byte unchanged; every existing test passes unmodified except where it
  read a problem as a bare string.

## How the contract is kept

- The tests validate **real output** from every mode against the schema file, with a validator in
  the test file. The validator implements a fixed set of keywords, and a test refuses a schema that
  uses any other - a validator silently skipping a keyword would pass output the schema forbids.
- The schema is **closed** (`additionalProperties: false`), so a field added to the output without
  being published fails the suite. Measured: one stray field fails three tests.
- The schema's list of codes is compared with the codes in the source, so neither can drift.
