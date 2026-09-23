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
- 🎯 **Harness-specific packaging**: shared sources with native adapters; validation limits in [docs/architecture.md](docs/architecture.md#compatibility).
- 💸 **Token economy**: state write-through model (rehydration once per session), model routing by cost class, structural phase pruning from confirmed upstream evidence.

## Installation

skraft ships as a **marketplace plugin**. The plugin source lives in [`plugins/`](./plugins).

### Claude Code

Enter these commands in Claude Code:

```text
/plugin marketplace add SebastienDegodez/skraft-plugin
/plugin install skraft
```

### GitHub Copilot, Codex, Cursor

[plugins/skraft-framework/plugin.json](plugins/skraft-framework/plugin.json) is the canonical
[Agent Plugins v1](https://agent-plugins.org/specification) manifest, with `$schema` and no root
`agents` list. Exactly two editable runtime trees ship: 31 flat Copilot `.agent.md`
descriptors in `com.github.copilot/agents/`, and 31 flat native Claude `.md` descriptors
in `com.anthropic.claude-code/agents/`. Body and description sync bidirectionally;
Markdown destinations adapt to each client while native headers remain untouched.
Shared-field baseline v2 records stable IDs, not a third descriptor source.
Skills and runtime stay shared.

Hooks have **one canonical source, two physical plugin surfaces**, with no extra manifest pointers:

| Surface | Hook manifest |
|---|---|
| Canonical source; Claude compatibility | [plugins/skraft-framework/hooks/hooks.json](plugins/skraft-framework/hooks/hooks.json) |
| Generated Copilot namespace; exact byte copy | [plugins/skraft-framework/com.github.copilot/hooks/hooks.json](plugins/skraft-framework/com.github.copilot/hooks/hooks.json) |
| Separate repository-checkout integration | [.github/hooks/skraft-framework.json](.github/hooks/skraft-framework.json) |

Actual Copilot CLI **1.0.83** fixture tests passed namespaced agent discovery and `SessionStart` /
`PreToolUse` with `CLAUDE_PLUGIN_ROOT`, including paths with spaces.
[scripts/copilot-hook-smoke.mjs](scripts/copilot-hook-smoke.mjs), run with exact CLI **1.0.83**
pinned via `--cli` and an isolated `COPILOT_HOME`, also passed against the current migrated
plugin installed from the local marketplace checkout: **PASS allowed** (1 hook audit entry),
**PASS denied** (1 hook audit entry), forbidden write absent. This does not verify the full
six-root picker or hidden-subagent invocation.
VS Code **1.126** source currently falls back through `.plugin` then
`.claude-plugin`; full live v1 validation remains unverified. These results are not a blanket
compatibility claim. See [docs/architecture.md](docs/architecture.md#11-projection-par-harness)
for current packaging, Claude registration requirements and validation limits.

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
| Runtime guardrails G1–G8 (hooks; G4/G5 in the state CLI) | ✅ Implemented and tested; live harness receipt for G7 only |
| Observability (health check, housekeeping) and recovery (`diagnose`, `rollback`, `resolve-stale`) | ✅ Implemented — see the [roadmap](./docs/roadmap.md) |

## Development

Edit only canonical agent and hook sources, then run `npm run plugin:build` and
`npm run plugin:check` to generate and verify Copilot adapters. Commit generated adapters:
marketplace Git installs do not run a build.

```bash
# Tests (boundary-to-boundary, 0 runtime dependency)
node --test "tests/skraft-framework/**/*.test.mjs"

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
  2. updates [CHANGELOG.md](CHANGELOG.md) and stamps plugin manifests and runtime package metadata
     through [scripts/set-version.mjs](scripts/set-version.mjs),
  3. creates the **`vX.Y.Z` tag** and the **GitHub Release** with the release notes,
  4. commits everything with `chore(release): X.Y.Z [skip ci]`.

See the [**Releases**](https://github.com/SebastienDegodez/skraft-plugin/releases) for the per-version
change history.

## Contributing

1. Branch off `main`.
2. Use **Conventional Commits** (required for automatic versioning).
3. `node --test "tests/skraft-framework/**/*.test.mjs"` must pass.
4. Open a Pull Request — CI checks tests, config policy and models.

## License

**GNU General Public License v3.0 or later** (`GPL-3.0-or-later`) — full text in [`LICENSE`](./LICENSE).

Copyright (C) 2026 Degodez Sébastien

This program is free software: you can redistribute it and/or modify it under the terms of the
GNU General Public License as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version. It is distributed WITHOUT ANY WARRANTY; without
even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
