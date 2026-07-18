---
description: "Imposes SKRAFT DDD, modularity, ADR and test-design rigor on HVE RPI research/plan artifacts"
applyTo: '**/.copilot-tracking/research/**, **/.copilot-tracking/plans/**, **/.copilot-tracking/details/**'
---
<!-- markdownlint-disable-file -->
<!-- PORTABILITY: overlay carried by the skraft-hve-overlays plugin. `applyTo:` is Copilot
     auto-load (belt); read on demand on harnesses without path-scoped auto-load (suspenders).
     Harness-neutral. Skills resolve only if the `skraft` plugin is installed. -->

# SKRAFT RPI Design-Rigor Overlay

Applies when producing HVE RPI research and planning artifacts (the design surface).

## Imposed rigor (fail-closed)

Before finalizing a plan/design under these artifacts you **MUST** load and apply:

- `architecture-patterns` — DDD strategic + tactical, Event Modeling, Clean Architecture, bounded contexts, **modularity / Balanced Coupling**.
- `architecture-decisions` + `adr-eligibility-gate` — record genuine decisions as ADRs; filter non-decisions before drafting.
- `test-design-mandates` — coverage matrix and **Walking Skeleton** ordering.
- `bdd-methodology` — behavioral acceptance framing.
- `contract-testing` — API/event contracts when integration boundaries exist.

A plan **CANNOT** be considered ready if a non-baseline structural decision lacks an ADR, a bounded-context/modularity classification is missing, or the test-design mandate is absent — **block** and list gaps.

## Non-goal

- Do not auto-map coupling to a pattern; classify risk and let human/architect judgement decide.
