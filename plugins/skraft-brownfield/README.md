# skraft-brownfield

The brownfield half of SKRAFT, as a plugin of its own: turn an undocumented codebase into a PRD,
pin its current behaviour under characterization tests, then refactor it safely with the Mikado
Method or a Strangler Fig. It installs next to the engineering plugin (`skraft`) and reuses its
`contract-testing` and `mocking-strategy-roster` skills by name; it holds no path into it.

User guides live in the [SKRAFT handbook](https://sebastiendegodez.github.io/skraft-plugin/) (FR and EN):
[Brownfield journey](https://sebastiendegodez.github.io/skraft-plugin/explanation/brownfield) explains the two workflows and how they rejoin
the engineering pipeline; [Put a characterization net](https://sebastiendegodez.github.io/skraft-plugin/how-to/characterize-legacy) and
[Refactor existing code under a net](https://sebastiendegodez.github.io/skraft-plugin/how-to/refactor-legacy) give the steps.

## Install

All plugins are listed in this repository's marketplace.

In Claude Code:

```text
/plugin marketplace add SebastienDegodez/skraft-plugin
/plugin install skraft
/plugin install skraft-brownfield
```

In Copilot CLI, install `skraft` and `skraft-brownfield` from the same marketplace, or install a clone
with `copilot plugin install ./plugins/skraft-brownfield`. In VS Code, find it under `@agentPlugins` in the
Extensions view, or register a clone with `chat.pluginLocations`.

## What it ships

| Agent | Role |
|---|---|
| `brownfield-analyst` | Characterizes the codebase (stack, features, integrations, contracts, coverage, risks), every claim a fact or a confidence-tagged inference, then composes a 17-section PRD under `docs/prds/`. |
| `brownfield-harness-builder` | Finds, generates or reconstructs the service's API contract and writes characterization tests that pin today's behaviour, bugs included, with downstream calls mocked. |
| `brownfield-refactorer` | Recommends Mikado or Strangler Fig, lets you choose, owns the graph or slice plan, and hands each leaf or slice to a fresh `refactoring-worker`. |
| `refactoring-worker` | Internal: takes one leaf or slice to a green commit, or reports what it found, then stops. |

Skills: `characterize-brownfield`, `characterize-with-contracts`, `mikado-method` (its
`validate-mikado` script ships as `.sh` and `.ps1` twins), `strangler-fig-method`.

## How to start

1. Ask `brownfield-analyst` to describe the system and draft its PRD.
2. Ask `brownfield-harness-builder` to build the safety net for the service you will change.
3. Start a **new session with `brownfield-refactorer` as its main agent** (Claude Code:
   `claude --agent skraft-brownfield:brownfield-refactorer`; Copilot: select the agent before the
   first prompt). It dispatches the workers itself; started as a subagent, it can only stop.

Build and test commands come from the component in `skraft-config.json` when the repository has
one.
