<!-- markdownlint-disable-file -->
# DISCUSS — Stories: us3-g1-dispatch-order-guard

Phase: DISCUSS · Date: 2026-06-28 · Project slug: us3-g1-dispatch-order-guard
Source triage: research/2026-06-28/triage-2026-06-28.md · Sprint proposal: research/2026-06-28/sprint-proposal.md

## Milestone Summary

| Field | Value |
|---|---|
| Milestone | skraft-framework Phase 1 — MVP |
| SKRAFT theme slug | g1-dispatch-order-guard |
| Epic parent | #42 |
| Theme (one sentence) | Make every agent dispatch in a SKRAFT run provably in-order, fail-closed, so the pipeline can never silently run the wrong or a skipped agent. |
| Depth tier | comprehensive · Difficulty: medium |
| Scope | Single ready story (#49). No backlog sweep — orchestrator-pinned issue. |
| Non-goals | Build-time structural invariant (`dispatch-policy.mjs`, already shipped); downstream guards #10 (G6 continuation), #11 (G7/G8 session). |

## Sprint Plan

### MoSCoW

| Story | Issue | Priority | MoSCoW | Effort | Days | Reasoning |
|---|---|---|---|---|---|---|
| US3 — G1 dispatch-order guard | #49 | P1 | Must | M | 1.0 | Anti-drift core guard on the Phase-1 MVP critical path; directly targets the observed "wrong agent / skipped order" failure. No workaround exists once agents auto-dispatch. |

### Capacity Check

```
Sustainable capacity = 5 team-days × 0.7 = 3.5 story-days
Scheduled            = 1.0 story-day (US3 / #49)
1.0 ≤ 3.5  ✅  within capacity (no XL, no overload)
```

### Dependency Graph (DAG — validated, no cycles)

```
#47 Foundation Clean Architecture (DONE/merged)
      │
#48 Config generator: phaseOrder + phaseAgents (DONE/merged)
      │
      ▼
#49 US3 — G1 dispatch-order guard   ← schedulable day 1 (all deps satisfied)
      │
      ├──► #10 G6 continuation guard   (downstream dependent — NOT this sprint)
      └──► #11 G7/G8 session guard     (downstream dependent — NOT this sprint)
```

DFS back-edge check: none. Graph is a valid DAG. #49 has zero unsatisfied dependencies → start on day 1.

## Story List

| ID | Title | Persona | Story statement | Effort | Priority | DoR | Dependencies |
|---|---|---|---|---|---|---|---|
| US3 / #49 | G1 dispatch-order guard (anti wrong-agent) | SKRAFT pipeline operator `[PERSONA INFERRED]` | As a SKRAFT pipeline operator, I want every agent dispatch validated against the recorded pipeline state before the agent runs, so that the run can never silently skip, invert, or re-order a phase and waste tokens on garbage artefacts. | M (≈1.0d) | Must (P1) | ✅ READY (8/8) | #47 (DONE), #48 (DONE) |

Full story + acceptance criteria: `plans/2026-06-28/ac-draft-us3.md`.

## Ready-for-DESIGN Checklist

- [x] Story DoR-approved (8/8 items pass)
- [x] Effort ≤ capacity, no XL split required
- [x] Dependencies satisfied (#47, #48 done/merged)
- [x] Antipattern scan clean (0 critical, 0 high)
- [x] All four issue ACs covered by testable boundary-level acceptance criteria
- [ ] backlog-planner-reviewer approval pending
