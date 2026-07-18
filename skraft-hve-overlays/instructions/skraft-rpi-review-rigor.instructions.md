---
description: "Imposes SKRAFT adversarial review lenses and quality-gate evidence on HVE RPI review artifacts"
applyTo: '**/.copilot-tracking/reviews/**'
---
<!-- markdownlint-disable-file -->
<!-- PORTABILITY: overlay carried by the skraft-hve-overlays plugin. `applyTo:` is Copilot
     auto-load (belt); read on demand on harnesses without path-scoped auto-load (suspenders).
     Harness-neutral. Skills resolve only if the `skraft` plugin is installed. -->

# SKRAFT RPI Review-Rigor Overlay

Applies when producing HVE RPI review artifacts.

## Imposed rigor (fail-closed)

Before accepting a review verdict you **MUST** load and apply:

- `adversarial-review-lenses` — independent lenses + weighted synthesis (no majority-voting away dissent).
- `architecture-review-criteria` — design/DDD/Clean Architecture rubric.
- `acceptance-review-criteria` — Gherkin/test-plan alignment rubric.
- `mutation-testing` — mutation score; kill surviving mutants.
- `quality-gates-evidence-contract` — structured evidence (tests, build, mutation, RED/GREEN integrity).
- `quality-gates-dotnet` — concrete .NET/Stryker commands when the stack is .NET.

A review **CANNOT** pass without a completed quality-gates evidence log and resolution/escalation of any BLOCKER dissent — **block** and list gaps.
