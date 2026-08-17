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

## Project

- [Roadmap][roadmap]: what is planned, and the `DT` prefix registration.

## The thesis, in one paragraph

Documentation is one of the most important parts of a project and almost always the least
maintained, because nothing about it fails loudly. A broken build stops you; a document claiming
`63 tests passing` against a suite of 136 keeps rendering perfectly. The usual remedy is discipline,
which nobody sustains. So instead: **derive what can be derived, and check what cannot.** That is a
much smaller job than it sounds, and it is the only version of this that survives contact with a
busy month.

[roadmap]: project/EWC3_Docs_Tools_Roadmap.md
