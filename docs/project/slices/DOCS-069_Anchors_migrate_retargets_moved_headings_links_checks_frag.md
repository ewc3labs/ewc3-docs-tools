---
id: DOCS-069
state: ⬜ planned
title: "Anchors: migrate retargets moved headings, links checks fragments"
est: M
doc: "[DOCS-069](slices/DOCS-069_Anchors_migrate_retargets_moved_headings_links_checks_frag.md)"
status: ""
---

# DOCS-069 — Anchors: migrate retargets moved headings, links checks fragments

**Anchors are unchecked, and migration breaks them silently.** `links` checks that a relative link's
FILE exists and ignores its `#fragment`. Migration moves `###` slice headings out of the roadmap
without retargeting the anchors that pointed at them. Measured on a downstream register: 12 in-page
anchors, 4 already broken, and after cutover all 12 broken, 11 of them carried into slice documents
where no such heading exists.

## Fix, when picked up

1. **Migrate retargets an anchor to a moved slice heading**, whether a roadmap self-anchor (`#slug`)
   or `<roadmap>.md#slug` from any document in the repository. It becomes a link to that slice's
   document, with the path computed as in `DOCS-068`.
2. **`links` checks fragments** against the target file's headings using GitHub's slug rules, at
   least within the repository.
