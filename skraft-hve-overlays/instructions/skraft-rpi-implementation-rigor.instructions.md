---
description: "Imposes SKRAFT outside-in TDD, Clean Architecture and craft discipline on HVE RPI implementation artifacts and produced code"
applyTo: '**/.copilot-tracking/changes/**, **/*.cs, **/*.ts, **/*.tsx, **/*.js, **/*.py, **/*.rs, **/*.java, **/*.go, **/*.rb, **/*.php, **/*.kt'
---
<!-- markdownlint-disable-file -->
<!-- PORTABILITY: overlay carried by the skraft-hve-overlays plugin. `applyTo:` is Copilot
     auto-load (belt); read on demand on harnesses without path-scoped auto-load (suspenders).
     Harness-neutral. Skills resolve only if the `skraft` plugin is installed.
     NOTE: code globs mean this attaches to any code file in context, not only RPI-produced code. -->

# SKRAFT RPI Implementation-Rigor Overlay

Applies when implementing HVE RPI changes and when editing source/test code.

## Imposed rigor (fail-closed)

Before writing implementation code you **MUST** load and apply:

- `outside-in-tdd` — double-loop TDD, boundary-to-boundary, **Walking Skeleton**.
- `red-synthesize-green` — a failing test (RED) precedes any production code.
- `clean-architecture-testing` — test per layer (Domain/Application/Infrastructure/API/Architecture), doubles per boundary.
- `craft-discipline` — per-phase self-check, **including C10 = Object Calisthenics (the 9 rules)**.
- `test-refactoring-catalog` — refactor tests post-GREEN without changing coverage.
- `resolving-stack-commands` — resolve build/test/mutation commands via stack adapters (never hardcode).
- `mocking-strategy-roster` — resolve the mocking strategy for downstream dependencies.
- `playwright-evidence` — capture E2E evidence where applicable.

Production code written without a preceding failing test, or violating Clean Architecture layer direction or Object Calisthenics (craft-discipline C10), **MUST** be blocked and corrected.
