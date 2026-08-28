---
name: resolving-stack-commands
description: Use whenever an agent must run a toolchain command (build, test, mutation) and needs the concrete invocation. Resolves build/test/mutation commands from the detected stack via the `quality-gates-<tech>` adapters so no agent hardcodes `dotnet test`, `dotnet build`, or any toolchain command. Loaded by acceptance-designer and software-engineer.
---

# Resolving Stack Commands (stack-agnostic)

The single place that maps a repository's stack to its concrete toolchain
commands (build, test, mutation). No agent and no workflow step may hardcode a
command (`dotnet test`, `dotnet build`, `mvn test`, `pytest`, ...). They resolve
it here instead.

## Why this exists

The pipeline must run with .NET today and other stacks tomorrow (Java planned,
not yet supported). If each agent embeds `dotnet test`, swapping or adding a
stack means editing every agent. Centralizing the mapping keeps agents
tech-agnostic: they say "build the solution" / "run the test suite" / "run
mutation", this skill says how.

## Detection → adapter

Detect the stack from markers at the repo root, then resolve the concrete
commands from the matching `quality-gates-<tech>` adapter (the adapter owns the
build / test / mutation commands and their evidence mapping):

| Stack | Detection markers | Adapter | Status |
|---|---|---|---|
| .NET | `*.sln`, `*.slnx`, `**/*.csproj`, `Directory.Packages.props` | [quality-gates-dotnet](../quality-gates-dotnet/SKILL.md) (`dotnet build` / `dotnet test` / `dotnet stryker`) | supported |
| JavaScript/TypeScript, including frontend | `package.json` plus `stryker.config.*` or an `@stryker-mutator/*` dependency | `quality-gates-javascript` (planned; must own StrykerJS config, reporter lifecycle, report-freshness proof, and frontend scope mapping) | NOT SUPPORTED |
| Java | `pom.xml`, `build.gradle`, `build.gradle.kts` | _(quality-gates-java not yet provided)_ | NOT SUPPORTED |

If multiple stacks coexist, run each adapter and aggregate results.

## Unsupported stack → stop, never guess

If the detected stack has no `quality-gates-<tech>` adapter, STOP and emit a
structured blocker. Never invent a command:

```yaml
status: blocked
type: unsupported_stack
message: No quality-gates adapter for the detected stack
context:
  stack: java
  markers:
    - pom.xml
  needed: test
```

## Contract for callers

- Resolve the command (build / test / mutation) from the matching `quality-gates-<tech>` adapter; do not embed it in workflow steps.
- Run it, then assert on its output (build succeeds, RED on a business assertion, GREEN gate, mutation score, etc.).
- Adding a stack = add a `quality-gates-<tech>` adapter and a row here, with zero edits to agents.
