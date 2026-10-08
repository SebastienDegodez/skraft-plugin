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
| Node JavaScript, TAP | Selected `package.json` declares installed StrykerJS core + TAP 9.6.1; explicit checked-in core/boundary configs use `testRunner: 'tap'` | [quality-gates-javascript](../quality-gates-javascript/SKILL.md): checked-in scripts/native Node tests and sequential mutation runner | narrow support; no G11 coverage enforcement |
| TypeScript tested with Vitest (React front end, Node package) | A `package.json` whose devDependencies hold `vitest` | [quality-gates-typescript](../quality-gates-typescript/SKILL.md) (`{bin:vitest} run` / `{bin:typescript:tsc} --noEmit` / ESLint boundaries / StrykerJS 10 with the Vitest runner through `mutation-gate.mjs`, run from the package's `node_modules`) | supported; uninstalled dependencies, a missing coverage provider or Stryker runner is a blocker |
| Node JavaScript without StrykerJS core + TAP 9.6.1 | A `package.json` that neither row above matches (Stryker absent, other runner or version, no Vitest) | No matching supported adapter | NOT SUPPORTED — a missing mutation runner is a blocker, never an exemption |
| TypeScript or browser code under another test runner | Jest, Mocha, Karma or Jasmine without Vitest | No matching supported adapter | NOT SUPPORTED |
| Python | `pyproject.toml` | [quality-gates-python](../quality-gates-python/SKILL.md) (`{python} -m pytest` / `{python} -m compileall` / cosmic-ray through `mutation-gate.mjs`, run from `.venv`) | supported; no `.venv` and no `--python` is a blocker |
| Java | `pom.xml`, `build.gradle`, `build.gradle.kts` | _(quality-gates-java not yet provided)_ | NOT SUPPORTED |

Every `package.json` (outside `node_modules`), every `pyproject.toml` and every .NET solution in the repository is a stack to resolve; a front end in `web/` is a TypeScript stack beside the backend's. If multiple stacks coexist, run each adapter and aggregate results; an unsupported one blocks the whole delivery, even when another stack passes.

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

## Stack-commands file (resolve once per pipeline)

Inside a SKRAFT pipeline, resolved commands live in one file every later agent reads:
`.copilot-tracking/skraft-plans/{projectSlug}/details/{date}/stack-commands.md`.

- **Read before resolving.** When the handoff block lists the file, take the commands
  from it and do not run the detection above.
- **Resolve only when** the file is absent, a command in it fails to start or to build
  (a test that fails on its assertion is not a command failure), or the stack markers
  changed since the recorded revision.
- **Write:** the first agent that resolves writes the whole file; a later agent that
  re-resolves rewrites only the failing rows and the revision line.
- Never record credentials, tokens or environment-variable values in it.

```markdown
<!-- markdownlint-disable-file -->
# Stack commands
- Stack: {stack} — adapter `quality-gates-{tech}`
- Resolved at: {output of git rev-parse HEAD}

| Purpose | Command | Working directory |
|---|---|---|
| build | {command} | {dir} |
| test — full suite | {command} | {dir} |
| test — one test (filter placeholder `{TestName}`) | {command} | {dir} |
| mutation — core (adapter script) | {command} | {dir} |
| mutation — boundary (adapter script) | {command} | {dir} |
```

## Contract for callers

- Resolve the command (build / test / mutation) from the matching `quality-gates-<tech>` adapter; do not embed it in workflow steps.
- Run it, then assert on its output (build succeeds, RED on a business assertion, GREEN gate, mutation score, etc.).
- Adding a stack = add a `quality-gates-<tech>` adapter and a row here, with zero edits to agents.
