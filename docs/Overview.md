# Overview

Documentation for ewc3-docs-tools.

The [README](../README.md) says what the toolkit is and why each check exists. These pages are about
using it.

## Using it

- [Adopting](Adopting.md): wiring it into a repository — Node, Python, .NET, anything. The easy
  buttons, the CI job, and what to adopt in what order.
- [Reference](Reference.md): every command, flag, config field, and resolver. A test asserts this
  page covers the code's surface, so it cannot quietly fall behind.
- [For agents](For_Agents.md): if you are an AI agent working in a repo that uses this. Short, and
  mostly about failure modes that are specifically yours.

## Proposals

- [Prefix registry and `repoHQ`][prefix-registry-and]: cross-repo prefix ownership — `prefixOwner`,
  an HQ pointer, and generating the registry instead of hand-syncing it. Proposal only; nothing
  built.
- [The slice document is the object][slice-object]: the slice doc becomes the authored authority -
  frontmatter, a typed dependency graph, `Slice:`/`State:` git trailers, and Ready/Blocked views.
  Names the authority the canon calls for. Proposal only; nothing built.
- [Clerical work belongs to CI][clerical-work]: the canon these proposals serve - what is
  bookkeeping, what is judgement, and the measurements that make it a rule rather than a preference.

## Project

- [Roadmap][roadmap]: what is planned, and the `DT` prefix registration.

## The thesis, in one paragraph

Documentation is one of the most important parts of a project and almost always the least
maintained, because nothing about it fails loudly. A broken build stops you; a document claiming
`63 tests passing` against a suite of 136 keeps rendering perfectly. The usual remedy is discipline,
which nobody sustains. So instead: **derive what can be derived, and check what cannot.** That is a
much smaller job than it sounds, and it is the only version of this that survives contact with a
busy month.

[clerical-work]: design/clerical-work-belongs-to-ci.md
[prefix-registry-and]: design/prefix-registry-and-repo-hq.md
[roadmap]: project/EWC3_Docs_Tools_Roadmap.md
[slice-object]: design/the-slice-document-is-the-object.md
