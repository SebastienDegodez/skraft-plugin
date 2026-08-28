<div align="center">

# skraft

**Deterministic agentic SDLC pipeline — DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER**

Specialized agents, adversarial reviewers, discipline skills (Outside-In TDD, Clean Architecture)
and mechanical guardrails (hooks) ported to **Claude Code**, **GitHub Copilot** and **Cursor**.

[![skraft-framework CI](https://github.com/SebastienDegodez/skraft-plugin/actions/workflows/skraft-framework-ci.yml/badge.svg)](https://github.com/SebastienDegodez/skraft-plugin/actions/workflows/skraft-framework-ci.yml)
[![Release](https://github.com/SebastienDegodez/skraft-plugin/actions/workflows/release.yml/badge.svg)](https://github.com/SebastienDegodez/skraft-plugin/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/SebastienDegodez/skraft-plugin?sort=semver)](https://github.com/SebastienDegodez/skraft-plugin/releases)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://www.conventionalcommits.org/)
[![semantic-release](https://img.shields.io/badge/semantic--release-conventional-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release)

</div>

---

## Description

**skraft** turns a coding assistant into a **disciplined software production line**.
Each lifecycle phase is driven by a specialized agent, reviewed by a dedicated adversarial
reviewer, and **locked down by deterministic guardrails** (hooks) that block — *before* paying
for the sub-agent — any out-of-sequence dispatch, any mandatory skill left unloaded, or any
progression without a real artifact, an `APPROVED` verdict and a verified git commit.

The runtime core follows a **hexagonal architecture (Clean Architecture)** with zero external
dependency, tested boundary-to-boundary and hardened with mutation testing.

## Key features

- 🔁 **5-phase SDLC pipeline** orchestrated by `skraft-orchestrator`: DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER.
- 🤖 **Specialized phase agents**: `backlog-discoverer`, `backlog-planner`, `solution-architect`, `acceptance-designer`, `software-engineer` — each with its dedicated **adversarial reviewer**.
- 🔬 **Independent reviewer lenses** (quality-gates, architecture-boundaries, test-integrity, cold-reader) synthesized into a weighted verdict.
- 📚 **Discipline skills**: Outside-In TDD, Clean Architecture testing, BDD/Gherkin, mutation testing, contract testing, ADR, issue refinement…
- 🛡️ **Mechanical guardrails G1–G8** (fail-closed hooks): dispatch ordering, forced skill loading + JSONL audit, artifact/verdict/commit verification, state protection.
- 🎯 **Multi-harness portability**: the same guardrails on Claude Code, Copilot CLI and Cursor.
- 💸 **Token economy**: state write-through model (rehydration once per session), model routing by cost class, repo-wide `depthTier` configurator.

## Installation

skraft ships as a **marketplace plugin**. The plugin source lives in [`plugins/`](./plugins).

### Claude Code

Enter these commands in Claude Code:

```text
/plugin marketplace add SebastienDegodez/skraft-plugin
/plugin install skraft
```

### GitHub Copilot, Codex, Cursor

The portable manifest lives at `plugins/skraft-framework/plugin.json` and each client that needs its
own schema gets a sibling manifest (`.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`).
The portable manifest deliberately omits the [Agent Plugins 1.0](https://agent-plugins.org/specification)
`$schema` marker: VS Code's Agent Plugins v1 adapter substitutes no plugin-root token in hook
commands, so a plugin recognized under it cannot locate its own CLI. Detection therefore falls
through to `.claude-plugin/plugin.json`, whose adapter does expand `${CLAUDE_PLUGIN_ROOT}`.
Skills and runtime stay shared. Copilot `.agent.md` files are canonical; Claude receives a deterministic `.md` mirror.
Copilot loads path-scoped rules natively, while Claude receives only each agent's declared companion
rules through `SubagentStart`.

Harness-specific hooks live under their reverse-domain namespace:

| Harness | Hook manifest |
|---|---|
| Claude Code, Codex, VS Code | `com.anthropic.claude-code/hooks/hooks.json` |
| Copilot (installed plugin) | `com.github.copilot/hooks/hooks.json` |
| Copilot (repo checkout, cloud agent) | [`.github/hooks/skraft-framework.json`](./.github/hooks/skraft-framework.json) |

See [`docs/architecture.md`](./docs/architecture.md) for the per-harness porting details.

## Quick start

Once the plugin is installed, select `skraft-orchestrator` in the agent picker
and give it a refined story.

The orchestrator automatically resumes from the last persisted state, manages phase transitions,
reviewer verdicts (with retry), and the engineer ↔ reviewer loop.

## Documentation

All documentation lives in [`docs/`](./docs/).

| Topic | Link |
|---|---|
| 📑 Documentation index | [`docs/README.md`](./docs/README.md) |
| 🏗️ Plugin architecture | [`docs/architecture.md`](./docs/architecture.md) |
| 🔌 Distributed plugin (install, pipeline, guardrails, packaging) | [`plugins/skraft-framework/README.md`](./plugins/skraft-framework/README.md) |
| 🛣️ Roadmap (13 US + status) | [`docs/roadmap.md`](./docs/roadmap.md) |
| 🤝 Engineer/Reviewer cross-cutting view | [`docs/agents/software-engineer-and-reviewer.md`](./docs/agents/software-engineer-and-reviewer.md) |
| 🎨 Documentation conventions | [`docs/conventions.md`](./docs/conventions.md) |

## Current status — summary

| Component | Status |
|---|---|
| SDLC pipeline orchestrated by `skraft-orchestrator` | ✅ Implemented |
| Specialized phase agents (`backlog-*`, `solution-architect*`, `acceptance-designer*`, `software-engineer*`) | ✅ Implemented |
| Reviewer lenses (`quality-gates`, `architecture-boundaries`, `test-integrity`, `cold-reader`) | ✅ Implemented |
| Operational skills (`plugins/skraft-framework/skills/*`) | ✅ Implemented |
| Hook guardrails G1–G5 + G4/G5 (artifact/verdict/commit) | ✅ Implemented |
| Guardrails G6–G8, observability, recovery | 🚧 [Roadmap](./docs/roadmap.md) |

## Development

```bash
# Tests (boundary-to-boundary, 0 runtime dependency)
node --test tests/skraft-framework/*.test.mjs

# Mutation testing (Stryker)
npm --prefix plugins/skraft-framework/src ci && node plugins/skraft-framework/src/node_modules/.bin/stryker run plugins/skraft-framework/src/stryker.config.mjs

# Policy checks (data-driven config, models by cost class)
node plugins/skraft-framework/src/cli/build-config-bin.mjs --check
node plugins/skraft-framework/src/cli/resolve-model-bin.mjs --check
```

Test placement and Stryker configuration rules are described in [`AGENTS.md`](./AGENTS.md).

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
    2. updates [`CHANGELOG.md`](./CHANGELOG.md) and stamps the version into the five plugin manifests
      (`plugin.json`, `.plugin/`, `.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`) + `src/package.json`,
  3. creates the **`vX.Y.Z` tag** and the **GitHub Release** with the release notes,
  4. commits everything with `chore(release): X.Y.Z [skip ci]`.

See the [**Releases**](https://github.com/SebastienDegodez/skraft-plugin/releases) for the per-version
change history.

## Contributing

1. Branch off `main`.
2. Use **Conventional Commits** (required for automatic versioning).
3. `node --test tests/skraft-framework/*.test.mjs` must pass.
4. Open a Pull Request — CI checks tests, config policy and models.

## License

**GNU General Public License v3.0 or later** (`GPL-3.0-or-later`) — full text in [`LICENSE`](./LICENSE).

Copyright (C) 2026 Degodez Sébastien

This program is free software: you can redistribute it and/or modify it under the terms of the
GNU General Public License as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version. It is distributed WITHOUT ANY WARRANTY; without
even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
