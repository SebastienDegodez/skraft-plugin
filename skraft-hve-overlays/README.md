# skraft-hve-overlays

SKRAFT rigor overlays that attach to HVE artifacts (backlog + RPI + PRD) via `applyTo` and impose SKRAFT skills in fail-closed prose. Additive only — does not modify HVE or the `skraft` core plugin.

## Dependency

Skills referenced by these overlays (`issue-refinement`, `architecture-patterns`, `outside-in-tdd`, `craft-discipline`, …) live in the **`skraft`** plugin. Install `skraft` alongside this plugin, otherwise the overlays attach but the skills do not resolve.

## Overlays

| File | Attaches to | Imposes |
|---|---|---|
| `skraft-backlog-story-quality` | backlog tracking artifacts | `issue-refinement` (INVEST/DoR) |
| `skraft-prd-quality` | PRD sessions + `docs/prds/` | `issue-refinement` (FR-/NFR- quality, traceability) |
| `skraft-rpi-design-rigor` | RPI research/plans/details | DDD, modularity, ADR, test-design, BDD, contracts |
| `skraft-rpi-implementation-rigor` | RPI changes + code files | outside-in TDD, Clean Architecture, craft-discipline (incl. Object Calisthenics), mocking, stack commands |
| `skraft-rpi-review-rigor` | RPI reviews | adversarial lenses, mutation testing, quality-gate evidence |
