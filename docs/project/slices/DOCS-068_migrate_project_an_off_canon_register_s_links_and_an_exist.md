---
id: DOCS-068
state: 🟦 tested
title: "migrate-project: an off-canon register's links and an existing Prefix register"
est: M
doc: "[DOCS-068](slices/DOCS-068_migrate_project_an_off_canon_register_s_links_and_an_exist.md)"
status: ""
state_sha: 2bd598375de6
state_source: trailer
---

# DOCS-068 — migrate-project: an off-canon register's links and an existing Prefix register

A downstream pilot migrated a register kept **off-canon** in `docs/project/roadmap/`, which already
carried a register in the canonical `| Prefix | Scope | Owner | Last Used | Series |` shape. Nothing
in its output was reported as wrong.

## What broke

- **Every moved link landed one level too deep.** The rebase prepended one `../`, which assumed text
  moved from `docs/project/` into `slices/`. From `docs/project/roadmap/` that was wrong for in-repo
  and sibling-repository links alike. The roadmap's own links broke the same way when it moved up to
  `docs/project/` on adoption.
- **Links carried into frontmatter kept the source depth**, so `index` rendered them one level too
  deep into the roadmap's new home, and most rows diverged.
- **The existing register went unrecognised.** Migration looked only for the legacy
  `| Series | Last Num |` shape, so it reported every global prefix unclaimed and synthesised a
  **second** register, dropping the reference-only and frozen rows.
- **The synthesised register's markers could not refresh.** They closed as `<!--/-->`, a form
  `values` never matches, and a fixed five-digit pad re-spelled `XY-003` as `XY-00003`.

## Fix

- **Links are computed, not prefixed:** `relative(to, resolve(from, link))`, for inline links,
  images and reference definitions, with fragments carried and code untouched. An off-canon source
  is re-expressed from `docs/project/` before anything else runs. Rows, frontmatter and narrative
  moved into `slices/` therefore all start from the directory they will actually live in.
- **A register already in the `Prefix` shape is kept byte-for-byte.** The report reads its owner and
  scope as written.
- **A synthesised register writes `<!--/ewc3:lastXY-->`**, padded as the ids are written, or as
  `series.widths` declares.

Tests use an off-canon fixture with an in-repo link and a sibling-repository link with its GitHub
twin. After adoption, `links` problems equal the baseline and `index --check` exits 0. Migrating
this repository's own register now reads `DOCS global ... ewc3-docs-tools`.
