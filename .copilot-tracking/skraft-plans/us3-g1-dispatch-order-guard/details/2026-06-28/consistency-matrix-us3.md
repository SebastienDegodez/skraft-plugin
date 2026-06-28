<!-- markdownlint-disable-file -->
# Consistency Matrix — US3 / G1 Dispatch-Order Guard (#49)

**Story:** us3-g1-dispatch-order-guard (#49)
**Date:** 2026-06-28
**Source of truth:** ADR set under `docs/adr/adr-004-deny-by-default-dispatch-gate.md` and
`docs/adr/adr-005-config-published-language.md`

> **Consolidation note (rework attempt 2):** the earlier draft carried four story ADRs
> (004 pipeline-policy purity, 005 deny-by-default, 006 recorded-state schema, 007 config). Two were
> retired as ADR-inflation — old ADR-004 (pure runtime service) re-declared the hexagonal baseline
> (ADR-002), and old ADR-006 (state Value-Object + boundary validation) re-declared the DDD tactical
> baseline. The two genuine cross-cutting trade-offs were kept and renumbered contiguously:
> **ADR-004 = deny-by-default (fail-closed)**, **ADR-005 = config as Published Language / guard as
> Conformist**. Concepts formerly cited against the retired ADRs are re-pointed to those baselines.

## Shared artifact registry

```yaml
shared_artifact_registry:
  ADR-004:
    source_of_truth: docs/adr/adr-004-deny-by-default-dispatch-gate.md
    consumers: [DISTILL, DELIVER]
    owner: solution-architect
    integration_risk: high
    validation: G2
  ADR-005:
    source_of_truth: docs/adr/adr-005-config-published-language.md
    consumers: [DISTILL, DELIVER]
    owner: solution-architect
    integration_risk: medium
    validation: G2
  retired_adrs:
    note: >
      old ADR-004 (pipeline-policy purity) and old ADR-006 (recorded-state schema) were retired as
      inflation; their concerns fold into the hexagonal baseline (ADR-002) and the DDD tactical
      baseline respectively. No file exists for them.
  event-model:
    source_of_truth: .copilot-tracking/skraft-plans/us3-g1-dispatch-order-guard/details/2026-06-28/event-model-us3.md
    consumers: [DISTILL]
    owner: solution-architect
    integration_risk: medium
    validation: G10
    note: component diagram + context map are embedded in this file (no separate diagrams-us3.md)
  contracts:
    source_of_truth: .copilot-tracking/skraft-plans/us3-g1-dispatch-order-guard/details/2026-06-28/contracts-us3.md
    consumers: [DISTILL, DELIVER]
    owner: solution-architect
    integration_risk: high
    validation: G10
```

## Canonical-label table (one spelling per concept, identical across all artefacts)

| Concept | Canonical label | event-model-us3.md | contracts-us3.md | ADR (source of truth) |
|---|---|---|---|---|
| `RequestAgentDispatch` | Command | Command | implicit (PreToolUsePayload input) | ADR-004 |
| `PipelinePolicy` | Domain Service | Domain Service | Domain Service (Contract 2) | ADR-004 / ADR-005 (purity: baseline ADR-002) |
| `state-schema` | Domain Service | Domain Service | Domain Service (Contract 1) | baseline (hexagonal ADR-002 + DDD tactical) |
| `PipelineState` | Value Object | Value Object | Value Object | baseline (DDD tactical) |
| `ReviewVerdict` | Value Object | Value Object | Value Object (field of `PipelineState`) | baseline (DDD tactical) |
| `DispatchEvaluated` | Domain Event | Domain Event | Domain Event (Contract 4) | ADR-004 |
| `DispatchDecision` | Read Model | Read Model | `HarnessDecision` output (Contract 3) | ADR-004 |
| `GeneratedConfig` | Read Model (Published Language input) | Read Model | Published Language shape | ADR-005 |
| `AgentName` | primitive `string` (agent identity from `config.phaseAgents`) — NOT a VO | primitive string (relabelled) | `string` | ADR-005 |

## Matrix

| Concept | ADR (source of truth) | event-model-us3.md | contracts-us3.md | Cause | Verdict |
|---|---|---|---|---|---|
| `RequestAgentDispatch` | Command (ADR-004) | Command | Command (input) | n/a | PASS |
| `PipelinePolicy` | Domain Service (ADR-004/005; purity baseline ADR-002) | Domain Service | Domain Service | n/a | PASS |
| `state-schema` | Domain Service (baseline) | Domain Service | Domain Service | n/a | PASS |
| `PipelineState` | Value Object (baseline DDD tactical) | Value Object | Value Object | n/a | PASS |
| `ReviewVerdict` | Value Object (baseline DDD tactical) | Value Object | Value Object | n/a | PASS |
| `DispatchEvaluated` | Domain Event (ADR-004) | Domain Event | Domain Event | n/a | PASS |
| `DispatchDecision` | Read Model (ADR-004) | Read Model | Read Model | n/a | PASS |
| `GeneratedConfig` | Read Model (ADR-005) | Read Model | Read Model | n/a | PASS |
| `AgentName` | primitive `string` (ADR-005) | primitive string | `string` | LABEL_DRIFT (resolved) | PASS |

> Runtime decision function: named `evaluateDispatch` in `domain/pipeline-policy.mjs` across event
> model, contracts (Contract 2), and ADR-004 — deliberately distinct from the build-time
> `domain/dispatch-policy.mjs` `validateDispatch(descriptors)` export. No shared exported symbol.

## Back-propagation journal

| Round | Concept | Artefact rewritten | Before → After | Trigger |
|---|---|---|---|---|
| 1 | `AgentName` | event-model-us3.md | `Value Object` → `agent identity (primitive string resolved from config.phaseAgents)` | LABEL_DRIFT — contracts model the agent as `string`; aligned event model to the primitive |
| 1 | `evaluateDispatch` (function name, not a DDD concept) | event-model-us3.md, contracts-us3.md, adr-004 | `validateDispatch` → `evaluateDispatch` | Cross-module homonym with build-time `dispatch-policy.mjs::validateDispatch(descriptors)`; renamed runtime decision function to remove the miswiring vector |
| 2 | ADR set (consolidation) | matrix + all details files | 4 story ADRs (004/005/006/007) → 2 (ADR-004 deny, ADR-005 config); retired concepts re-pointed to baselines | ADR-inflation eligibility audit (Option A) |

## Final verdict

- consistency-gate: PASS
- per-concept canonical labels: identical across event-model-us3.md, contracts-us3.md, and ADR-004/005
- back-propagation rounds used: 1 label round + 1 consolidation round (ADR set 4 → 2)
- open blockers: 0
- supersessions: 0 (retired ADRs were Proposed and never ratified/indexed — removed, not superseded)
- blockers raised: none
