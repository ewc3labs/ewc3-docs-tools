# Adopting ewc3-docs-tools

Wiring this into a repository, whatever it is written in.

The goal is to end up **lazier than you started**. Not "disciplined about documentation" — nobody
sustains that. The point is that the parts which rot are derived from the thing they describe, and
the parts that can't be derived get checked by something that doesn't get bored.

## The five-minute version

```bash
# 1. Fix whatever is already wrong
npx --yes github:ewc3labs/ewc3-docs-tools format
npx --yes github:ewc3labs/ewc3-docs-tools links

# 2. Look at the diff. It never changes a word - only URLs and newlines.
git diff

# 3. Commit, then wire the check into CI
```

That's a legitimate stopping point. `format` and `links` need no configuration at all. Values and ID
series are worth adding later, when you have a number that keeps going stale.

## The two commands you actually type

| | writes to your tree | when |
| --- | --- | --- |
| **fix** | **yes**, idempotently | before you commit, as often as you like |
| **check** | never | in CI, and whenever you want an answer |

**Never hook `fix` to `build` or `test`.** A command that rewrites files as a side effect of
compiling or observing is one you stop trusting, and in CI it would modify the checkout. `npm test`
leaving your tree dirty is a bug, not a feature.

**CI refuses; it does not repair.** `check` names the stale file and fails. It never edits your
work, because a CI job that rewrites your documents behind you is its own kind of horror.

The value is not that documentation fixes itself. It is that **it can no longer be wrong and green
at the same time.**

## Node repositories

```bash
npm install --save-dev github:ewc3labs/ewc3-docs-tools
```

```json
{
  "scripts": {
    "docs:fix": "ewc3-docs fix",
    "docs:check": "ewc3-docs check",
    "fix": "npm run docs:fix && eslint src --fix",
    "verify": "npm run check-types && npm run lint && npm run docs:check && npm test"
  }
}
```

`fix` and `verify` are the pair worth having: one makes things correct, one asks whether they are.

If your repo generates any documentation of its own, put it **first** in `docs:fix` so the formatter
sees the generated output:

```json
"docs:fix": "npm run docs:config && ewc3-docs fix"
```

## Repositories with no package.json

A .NET add-in, an OpenSCAD library, a Klipper config, a pile of markdown. Node still has to be
present, but nothing gets installed:

```bash
npx --yes github:ewc3labs/ewc3-docs-tools check
```

Use the [shell shortcuts](#shell-shortcuts) so nobody types that twice.

## Python repositories

Python has no `npm scripts`, so pick whichever runner the project already uses. **Do not add a task
runner just for this** — if there is no obvious home, the shell shortcuts are the answer.

**Makefile**

```makefile
.PHONY: docs-fix docs-check
docs-fix:
	npx --yes github:ewc3labs/ewc3-docs-tools fix
docs-check:
	npx --yes github:ewc3labs/ewc3-docs-tools check
```

**Or a `pyproject.toml` runner you already have** — `poethepoet`, `nox`, `tox`, `just`:

```toml
[tool.poe.tasks]
docs-fix = "npx --yes github:ewc3labs/ewc3-docs-tools fix"
docs-check = "npx --yes github:ewc3labs/ewc3-docs-tools check"
```

**Values that come from Python.** `fromJson` and `countJson` read JSON, not TOML, so a version in
`pyproject.toml` is not directly readable. Two honest options:

- **`countMatches` against the file**, which works for anything with a stable shape:
  ```json
  "version": { "countMatches": { "files": ["pyproject.toml"], "pattern": "..." } }
  ```
  Only sensible for counts, not for extracting a string.
- **Write the number where the tool can read it.** If a build step already produces JSON — coverage
  output, a test summary, a manifest — point `fromJson` at that. This is what
  excel-power-query-editor does for its test count: the test run writes `test-counts.json`, and the
  docs read that rather than trying to parse a runner's output.

The second is better than it sounds. A number that a *build step* wrote is more trustworthy than one
scraped out of a config file, because it reflects what actually happened.

> **A TOML resolver is a known gap.** See `DT-1` in the
> [roadmap][roadmap]. Until it lands, the pattern above is the workaround
> rather than the design.

## Where the config lives

`.ewc3-docs.json` in the repository root, or `config/ewc3-docs.json` if the repository keeps
whole-repo configuration in one folder. Both are first-class; neither is a fallback.

```bash
ewc3-docs check --config config/docs.json    # or point at it explicitly
```

**Two config files is an error, not a preference.** If both locations exist the tool refuses and
names them, because the alternative is reading one and silently ignoring the other — which looks
exactly like the config not working.

**Paths inside the config are relative to the repository, never to the config file.** Moving it into
`config/` must not quietly reinterpret every glob in it.

**JSON, not YAML, and that is deliberate.** The toolkit has zero dependencies and runs anywhere Node
is present. YAML would mean a parser, and a parser means an install step for a tool whose whole
selling point is `npx` and go. A config this small does not earn one.

## CI

Keep it separate from your build job. None of this needs your language toolchain, and it runs in
about twenty seconds.

```yaml
name: Docs
on:
  workflow_dispatch:
  push:
    paths: ["**.md", "docs/**", ".ewc3-docs.json"]
  pull_request:
    paths: ["**.md", "docs/**", ".ewc3-docs.json"]

jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npx --yes github:ewc3labs/ewc3-docs-tools check
```

**Mind the paths filter.** If your main CI has `paths-ignore: ["**.md", "docs/**"]` — which is
sensible for a six-leg test matrix — then a docs-only change triggers *nothing*, and doc checks live
in the one workflow that never runs on doc changes. This separate workflow inverts the filter on
purpose.

## Shell shortcuts

`scripts/git-bash/bashrc.d/ewc3-docs.sh` gives you four verbs that work in **any** git repository:

| | |
| --- | --- |
| `docsfix` | make the docs correct |
| `docscheck` | ask whether they are |
| `docsseries` | who owns which ID prefix, and the last number used |
| `docsready` | fix, then check, then `git status` — the pre-commit habit in one word |

```bash
source /path/to/ewc3-docs-tools/scripts/git-bash/bashrc.d/ewc3-docs.sh
```

They prefer the repo's own `docs:*` npm script when one exists, because that script is allowed to
know things the generic tool does not, and fall back to `npx` otherwise. So the same four words work
in a Node extension, a .NET add-in, and a Python project, and you never think about which is which.

**`docsready` is the one to build the habit around.** It is the whole workflow: make it right, prove
it is right, show me what I am about to commit.

Full surface — every flag, config field, and resolver — is in the [Reference](Reference.md).

## What to adopt, in what order

1. **`format` and `links`.** No configuration, immediate payoff, and `links` usually finds something
   on the first run.
2. **CI check.** Now it cannot regress.
3. **`values`**, the first time you notice a number that has gone stale. Not before — a marker
   around a number nobody was getting wrong is just clutter.
4. **`series`**, when you have an ID scheme. It matters more than it looks: a "last number used"
   cell is the *input* to minting an ID, so a stale one hands out a number that is already taken and
   nothing complains.

Adopting all four on day one is the wrong order. Each of these earns its place by catching
something.

[roadmap]: project/EWC3_Docs_Tools_Roadmap.md
