# Test plan — US2 Générateur de config data-driven

Story: Task 2 of `.specs/plans/2026-06-20-skraft-framework-guardrails-plan.md`.
Layer model: foundation hexagonal under `plugins/src/` (mirrors `resolve-model`).
Runner: `node --test` (zero deps), tests in `tests/skraft-framework/`.

## Use case boundary

| Boundary | Entry point | Observation |
|---|---|---|
| Domain (pure rule) | `buildFrameworkConfig(descriptors)` in `domain/framework-config-policy.mjs` | returned config object |
| CLI use case | `main(argv, io)` in `cli/build-config.mjs` | written JSON file, exit code, io.log/io.error |

## Coverage matrix (Gherkin → test)

| Scenario | Level | Test file | Boundary asserted |
|---|---|---|---|
| Phase order mirrors orchestrator | Domain | `data-driven-config.test.mjs` | `config.phaseOrder` |
| Specialist/reviewer pairing | Domain | `data-driven-config.test.mjs` | `config.phaseAgents[phase]` |
| Skills carried with default `verify` policy | Domain | `data-driven-config.test.mjs` | `config.agentSkills[agent]` |
| Artifacts from inputs.required + outputs | Domain | `data-driven-config.test.mjs` | `config.agentArtifacts[agent]` |
| Agent without skills → empty set | Domain | `data-driven-config.test.mjs` | `config.agentSkills[agent]` |
| Build writes config JSON (`--apply`) | CLI (integration) | `build-config-cli.test.mjs` | written file content |
| Sync check passes when in sync (`--check`) | CLI (integration) | `build-config-cli.test.mjs` | exit code 0 + io.log |
| Sync check fails on drift (`--check`) | CLI (integration) | `build-config-cli.test.mjs` | exit code 1 + io.error |
| Frontmatter → descriptor mapping | CLI (pure) | `build-config-cli.test.mjs` | `parseAgentDescriptor()` |

## Mandate 4 — domain extraction justification (Gate b: combinatorial economy)

The config-building rules (phase partitioning, specialist vs reviewer selection,
skill-policy defaulting, artifact aggregation) form a combinatorial table over the
agent set. Driving every branch only through the CLI over temp-file fixtures would
explode the scenario count and tie each rule to filesystem setup. The pure
`buildFrameworkConfig` policy is extracted and unit-tested directly (table-driven);
the CLI tests then cover wiring, IO, and the guard exit codes — no double coverage.

## Out of scope (later tasks)

- Hook enforcement consuming the config (G1/G2 — Task 3/4).
- npm `config:build` / `config:check` wiring is delivered here as the guard surface.
