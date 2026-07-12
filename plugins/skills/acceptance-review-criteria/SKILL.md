---
name: acceptance-review-criteria
description: Use when reviewing DISTILL artefacts (Gherkin scenarios, test plans, implementation plans) for quality, completeness, and alignment. Contains the gate definitions and scoring rubric for the acceptance-designer-reviewer lenses.
---

# Acceptance Review Criteria

## Overview

Formal gate definitions and verdict rubric for the `acceptance-designer-reviewer`. Applied across 4 lenses (coverage, business-alignment, testability, boundary-enforcement).

---

## Gate Definitions (G1–G10)

### Lens 1: coverage-lens

| Gate | ID | Definition | Pass condition | Fail severity |
|---|---|---|---|---|
| AC–Scenario bijection | G1 | Every AC in `ac-draft-{story}.md` maps to ≥1 scenario. No scenario exists without a traceable AC. | All ACs covered, no orphan scenarios. | BLOCKER |
| Edge case representation | G2 | Boundary conditions and negative cases from the domain examples in the story are represented as scenarios. | ≥1 edge case or boundary condition scenario per business rule. | HIGH |

**Checking G1:**
1. List all ACs from `ac-draft-{story}.md`
2. List all scenarios from `*.feature`
3. Build a trace matrix: AC → scenario(s)
4. Flag any AC with no scenario (missing) and any scenario with no AC (orphan)

---

### Lens 2: business-alignment-lens

| Gate | ID | Definition | Pass condition | Fail severity |
|---|---|---|---|---|
| Business vocabulary | G3 | All nouns, verbs, and adjectives in Given/When/Then steps appear in the domain vocabulary of the stories or the business lexicon. No class names, method names, HTTP verbs, or framework names. | Zero technical identifiers in `.feature` files. | HIGH |
| No technical jargon | G4 | Given/When/Then steps contain zero implementation details: no HTTP status codes, no ORM terms, no database language, no DI container references. | Zero implementation leaks. | BLOCKER |

**G4 red flags (auto-fail):**
- `POST`, `GET`, `HTTP 200`, `HTTP 422`
- `Repository`, `Service`, `Handler`, `Controller`, `UseCase`
- `null`, `true`, `false` as business values (unless they are genuine domain terms)
- SQL, JSON, XML, YAML in scenario text
- Class names (Pascal case identifiers)

---

### Lens 3: testability-lens

| Gate | ID | Definition | Pass condition | Fail severity |
|---|---|---|---|---|
| Step unambiguity | G5 | Every step can be implemented without asking the designer for clarification. The step's meaning is unambiguous within the domain vocabulary. | Every step maps uniquely to a domain action or state. | HIGH |
| Implementation plan completeness | G6 | Every scenario listed in the `.feature` files has a corresponding entry in `impl-plan-{story}.md` with a file path and a use case boundary. | Bijection feature scenarios ↔ impl-plan entries. | HIGH |

**Checking G5:** For each step, ask "could two engineers implement this differently and both be correct?" If yes, the step is ambiguous.

---

### Lens 4: boundary-enforcement-lens

| Gate | ID | Definition | Pass condition | Fail severity |
|---|---|---|---|---|
| Layer boundary compliance | G7 | Each row in the coverage matrix targets an Application layer use case named in `contracts-{story}.md`. No scenario targets an Infrastructure adapter directly as its primary entry point. | All coverage matrix entries reference a use case boundary from the contracts. | BLOCKER |
| Walking skeleton coverage | G8 | At least one walking skeleton scenario per major feature flow is identified in the test plan (tagged `@smoke` or marked Walking Skeleton in the matrix). | ≥1 walking skeleton entry per feature flow. | HIGH |
| Visual AC evidence | G9 | Every `@visual` scenario has ≥1 Playwright E2E spec in `tests/e2e/` per `impl-plan-{story}.md`. jsdom/unit entry invalid. | Bijection `@visual` scenarios ↔ Playwright E2E spec entries. | HIGH |
| Comparable contract consistency | G10 | When `impl-plan-{story}.md` plans a component (hook/adapter/client) that is comparable to one already implemented for a similar responsibility in a prior story, its planned state/return/error convention matches the existing component's, unless the plan notes an explicit, justified divergence. | Every comparable pair of planned components shares its convention, or the divergence is explicitly noted and justified in the impl-plan. | HIGH |

**Checking G9:**
1. List all scenarios tagged `@visual` in the `.feature` files
2. List all `tests/e2e/` spec entries in `impl-plan-{story}.md`
3. Verify each `@visual` scenario maps to ≥1 E2E spec performing a real measurement (`boundingBox()`, computed colour/style)
4. Flag any `@visual` scenario whose only planned coverage is a unit/jsdom test

**Checking G10:**
1. List every client-side consumer (hook/adapter) named in `impl-plan-{story}.md` and the port it wraps.
2. Scan sibling `impl-plan-*.md` files (other stories in the same or prior milestones) for a consumer wrapping a comparable port (same shape class: list query, single-item query, command with optimistic update, ...).
3. When a comparable prior consumer exists, confirm `impl-plan-{story}.md` names it and states either "same convention as `{prior}`" or cites the `contracts-{story}.md` divergence note.
4. No comparable prior consumer in scope → gate is vacuously satisfied (nothing to compare against).
5. A named prior consumer with no convention statement, or a silent state-shape difference undetected by the plan → G10 HIGH fail.

---

## Severity Definitions

| Severity | Definition | Impact |
|---|---|---|
| **BLOCKER** | Fundamental correctness violation. The artefact cannot be used by DELIVER as-is. | Always triggers `rejected` verdict. |
| **HIGH** | Significant quality gap. Increases implementation risk or causes rework in DELIVER. | Triggers `changes_requested` unless no other severity exists. |
| **MEDIUM** | Quality improvement. Can be implemented but suboptimal. | Triggers `changes_requested`. |
| **LOW** | Style or consistency issue. Does not affect DELIVER. | `approved` with recommendation. |

---

## Verdict Derivation

| Condition | Verdict |
|---|---|
| ≥1 BLOCKER in ANY lens | `rejected` |
| ≥1 HIGH, 0 BLOCKER (across ALL lenses) | `changes_requested` |
| MEDIUM only (across ALL lenses) | `changes_requested` |
| LOW only, or all lenses pass | `approved` |

**Confidence:**
- `high` — all artefacts present, clear findings, no ambiguity
- `medium` — some artefacts missing, or findings require interpretation
- `low` — critical artefacts missing, review is incomplete

---

## Dissent Handling

When 3 lenses pass and 1 fails:

1. Document the minority finding explicitly in `dissent`
2. Assess whether the minority finding independently triggers BLOCKER/HIGH severity
3. If BLOCKER/HIGH → **uphold** the minority. Verdict = `changes_requested` or `rejected`.
4. If MEDIUM/LOW → **override** the minority. Verdict = `approved` with recommendation.
5. NEVER silently override. Document the reasoning.

Example dissent entry:
```
dissent: "business-alignment-lens flagged 'driver ID' in step text (G3 HIGH).
Overridden: 'driver ID' is a genuine domain term used consistently in the story
vocabulary. Not a technical identifier. Verdict remains approved."
```

---

## Scoring Rubric (per lens)

| Score | Meaning |
|---|---|
| `pass` | All gates in this lens pass. No findings. |
| `fail` | ≥1 gate in this lens has a finding. |

Each finding includes:
- `gate` — G1 through G10
- `severity` — BLOCKER / HIGH / MEDIUM / LOW
- `finding` — plain-language description of the problem
- `location` — file path and line/scenario reference
- `suggestion` — (optional) how to fix it

---

## References

- [gate-definitions.md](references/gate-definitions.md) — detailed gate checklist with examples
- [verdict-rubric.md](references/verdict-rubric.md) — decision table with example scenarios
