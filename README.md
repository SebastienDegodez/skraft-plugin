<div align="center">

# skraft

**Deterministic agentic software delivery — RESEARCH → DESIGN → DISTILL → DELIVER, then the pull request**

Specialist agents, isolated review lenses and discipline skills (Outside-In TDD, Clean Architecture),
driven by one tested engine under **Claude Code**, **GitHub Copilot CLI** and **VS Code**.

[![skraft-framework CI](https://github.com/SebastienDegodez/skraft-plugin/actions/workflows/skraft-framework-ci.yml/badge.svg)](https://github.com/SebastienDegodez/skraft-plugin/actions/workflows/skraft-framework-ci.yml)
[![Release](https://github.com/SebastienDegodez/skraft-plugin/actions/workflows/release.yml/badge.svg)](https://github.com/SebastienDegodez/skraft-plugin/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/SebastienDegodez/skraft-plugin?sort=semver)](https://github.com/SebastienDegodez/skraft-plugin/releases)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://www.conventionalcommits.org/)
[![semantic-release](https://img.shields.io/badge/semantic--release-conventional-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release)

</div>

---

## Description

**skraft** turns a coding assistant into a disciplined software production line. Give it one
refined story: specialist agents research it, design it, turn it into acceptance tests and
deliver tested code, and read-only lenses review each phase.

A host-neutral **engine** decides every step: phase order, expected outputs, write scope (the
diff after each step), gates run from your `skraft-config.json`, the review verdict, the red and
green commits of TDD. Each host has a thin driver that only starts the agents the engine asks
for. Every fact of a run lands in a hash-chained, signed journal in your repository. The plugin
ships no command hooks: nothing runs on your tool calls.

## Key features

- **One pipeline, three hosts**: the Claude Code mod, the Copilot CLI dynamic workflow, and under
  VS Code the Copilot SDK or a `skraft next` / `skraft record` loop; the same journal everywhere.
- **A workflow you can extend**: a DOT graph you copy into `.skraft/` with `skraft workflow eject`
  to add an agent, a lens, a gate or a question; DELIVER gates are locked, reviews mandatory.
- **Reviews computed in code**: one lens per node, a refuter checks every blocking finding, the
  engine decides; a re-review asks again only the lenses whose inputs changed.
- **Proof, not claims**: build, format, lint, test, architecture, coverage and mutation (100 %
  on Domain and Application, 80 % elsewhere) run by the engine, which writes the evidence.
- **A pull request at the end**: a draft by default, with your consent once per repository, the
  front end's Playwright screenshots, and, with the same consent, a progress comment on the story's issue.
- **Readable runs**: `skraft status`, the Claude Code pane, `run-report.md` and `qa-report.md`.
- **Review any pull request**: `skraft review --pr <number>` runs the same review lenses on one
  pull request, with no run, and can keep its verdict in one comment.
- **Coming from v1**: `skraft migrate` turns a v1 `skraft-config.json` and the v1 runs in
  progress into V2 ones, in place.

## Installation

skraft ships as a **marketplace plugin**. The plugin source lives in [`plugins/`](./plugins).

### Claude Code

Enter these commands in Claude Code:

```text
/plugin marketplace add SebastienDegodez/skraft-plugin
/plugin install skraft
/plugin install skraft-backlog
```

`skraft` is the engineering pipeline. `skraft-backlog` (optional) triages GitHub issues and
refines them into the stories the pipeline reads; see its [README](plugins/skraft-backlog/README.md).

If Windows fails during `/plugin marketplace add` with `fatal: unable to checkout working tree`,
clone SKRAFT to a short local path, then add that checkout as marketplace instead:

```powershell
git clone https://github.com/SebastienDegodez/skraft-plugin C:\s\skraft
```

```text
/plugin marketplace add C:\s\skraft
/plugin install skraft
```

Or enable Windows long paths, restart shell, then retry:

```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force
git config --global core.longpaths true
```

### GitHub Copilot CLI and VS Code

Install `skraft` from this repository's marketplace in Copilot CLI, or load
`plugins/skraft-framework` with `--plugin-dir`. In VS Code, find it under `@agentPlugins` in the
Extensions view, or register a clone with `chat.pluginLocations`.

Prerequisites on every host: Node 22 or later.

## Quick start

In the repository you work on, from its root (`skraft` is the command that
`node "<plugin folder>/engine/drivers/cli/skraft.mjs" install` sets up once; the long line works
without it):

```text
skraft init          detect your components into skraft-config.json
skraft doctor --run  check that every command runs
```

Then start a story: `/skraft <slug> [#issue] [title…] [--base <ref>] [--from-artifacts]` in Claude Code
or Copilot CLI, for example `/skraft paiement #42 Paiement par carte`, or select `skraft-orchestrator`
and give it the slug and the story. `/skraft` is measured in the Copilot CLI command registry (SDK 1.0.105), not yet in its TUI menu nor in
VS Code, where it is expected to say what to type without starting a run from the chat; an engineering run there is wired and tested on a simulated host, not yet run for real. The plugin
[README](plugins/skraft-framework/README.md) gives the command for each host.

## Plugins

| Plugin | What it does |
|---|---|
| [`skraft`](plugins/skraft-framework/README.md) | The engineering pipeline and its engine |
| [`skraft-backlog`](plugins/skraft-backlog/README.md) | Triages GitHub issues and refines them into the stories the pipeline reads |
| [`skraft-brownfield`](plugins/skraft-brownfield/README.md) | Characterizes an existing system, pins its behaviour, refactors it (Mikado, Strangler Fig) |

## Documentation

| Topic | Link |
|---|---|
| Handbook (FR and EN) | [sebastiendegodez.github.io/skraft-plugin](https://sebastiendegodez.github.io/skraft-plugin/) |
| Installing and running the plugin | [`plugins/skraft-framework/README.md`](plugins/skraft-framework/README.md) |
| Repository architecture | [`docs/architecture.md`](docs/architecture.md) |
| V2 design decisions | [Architecture](docs/site/en/explanation/architecture.md) |
| Maintaining the plugin | [`plugins/skraft-framework/MAINTAINING.md`](plugins/skraft-framework/MAINTAINING.md) |
| Skill evaluation | [Evaluation tooling](docs/site/en/reference/evaluation-tooling.md), [Evaluate a skill](docs/site/en/how-to/evaluate-a-skill.md) |

## Development

```bash
npm ci --prefix plugins/skraft-framework/engine
npm run test:engine               # engine unit and integration tests
npm run lint:engine               # function size and complexity limits
npm run mutation:engine:changed   # Stryker on the engine lines changed since integration/v2-next
npm run skills:check && npm run plugin:check && npm run backlog:check
node scripts/local-ci.mjs         # mirrors CI locally
```

Contribution rules, test placement and mutation rules are in [`AGENTS.md`](AGENTS.md).

## Versioning & releases

This project follows [**SemVer**](https://semver.org/) and publishes releases **automatically** via
[**semantic-release**](https://github.com/semantic-release/semantic-release).

- Commit messages must follow [**Conventional Commits**](https://www.conventionalcommits.org/):
  - `feat:` → **minor** bump; `fix:` / `perf:` / `refactor:` → **patch** bump;
  - `feat!:` or a `BREAKING CHANGE:` footer → **major** bump.
- **`docs:` never cuts a tag** — whatever the scope. Documentation lands without a version, and a
  docs-only push does not even start the workflow (`paths-ignore`). A `docs:` commit riding along
  with a `feat:` or `fix:` is released by that commit, as expected.
- The [`release.yml`](./.github/workflows/release.yml) workflow runs **automatically on every push
  to `main`**, and can also be started by hand from the Actions tab. When it runs, it:
  1. computes the next version from the commit history,
  2. updates [CHANGELOG.md](CHANGELOG.md) and stamps plugin manifests and runtime package metadata
     through [scripts/set-version.mjs](scripts/set-version.mjs),
  3. creates the **`vX.Y.Z` tag** and the **GitHub Release** with the release notes,
  4. commits everything with `chore(release): X.Y.Z [skip ci]`.

See the [**Releases**](https://github.com/SebastienDegodez/skraft-plugin/releases) for the per-version
change history.

## Contributing

1. Branch off the integration branch named in [`AGENTS.md`](AGENTS.md).
2. Use **Conventional Commits** (required for automatic versioning).
3. `node scripts/local-ci.mjs` must pass.
4. Open a Pull Request: CI runs the tests on Windows, macOS and Linux, mutation, lint and the
   agent policy checks.

## License

**GNU General Public License v3.0 or later** (`GPL-3.0-or-later`) — full text in [`LICENSE`](./LICENSE).

Copyright (C) 2026 Degodez Sébastien

This program is free software: you can redistribute it and/or modify it under the terms of the
GNU General Public License as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version. It is distributed WITHOUT ANY WARRANTY; without
even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
