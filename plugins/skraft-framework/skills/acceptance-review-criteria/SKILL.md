---
name: acceptance-review-criteria
description: Use when reviewing DISTILL artefacts (Gherkin scenarios, test plans, implementation plans) for quality, completeness, and alignment. Contains the gate definitions and scoring rubric for the DISTILL review lenses.
---

# Acceptance Review Criteria

## Overview

Formal gate definitions and verdict rubric for the DISTILL review. Applied across 4 lenses (coverage, business-alignment, testability, boundary-enforcement) that the engine runs; it computes the verdict from their findings.

---

## Gate Definitions (G1–G11, B1, T1–T4, E1–E2)

Every gate id is unique across the four lenses. Each lens loads the skill of its own gates; no lens loads this one.

| Lens | Gates | Skill |
|---|---|---|
| coverage-lens | G1, G2 | `acceptance-review-coverage` |
| business-alignment-lens | G3, G4, B1 | `acceptance-review-business-alignment` |
| testability-lens | G5, G6, T2, T3, T4, T1, G11 | `acceptance-review-testability` |
| boundary-enforcement-lens | G7, G8, E1, E2, G9, G10 | `acceptance-review-boundary-enforcement` |

- A reviewer that judges another's finding loads the skill of the gate that finding cites.
- An agent that checks its own DISTILL outputs before its result loads the four skills: every gate applies to its outputs.

---

## Severity Definitions

| Severity | Definition | Impact |
|---|---|---|
| **BLOCKER** | Fundamental correctness violation. The artefact cannot be used by DELIVER as-is. | Always triggers `rejected` verdict. |
| **HIGH** | Significant quality gap. Increases implementation risk or causes rework in DELIVER. | Triggers `changes_requested` unless no other severity exists. |
| **MEDIUM** | Quality improvement. Can be implemented but suboptimal. | Triggers `changes_requested`. |
| **LOW** | Style or consistency issue. Does not affect DELIVER. | `approved` with recommendation. |

---

## Scoring Rubric (per lens)

| Score | Meaning |
|---|---|
| `pass` | All gates in this lens pass. No findings. |
| `fail` | ≥1 gate in this lens has a finding. |

Each finding includes:
- `gate` — one id of the four gate skills above (G1–G11, B1, T1–T4, E1–E2)
- `severity` — BLOCKER / HIGH / MEDIUM / LOW
- `finding` — plain-language description of the problem
- `location` — file path and line/scenario reference
- `suggestion` — (optional) how to fix it

---

## References

- [verdict-rubric.md](references/verdict-rubric.md) — how the findings give the verdict, confidence levels, dissent between lenses, example verdicts
- [gate-definitions.md](references/gate-definitions.md) — detailed gate checklist with examples
