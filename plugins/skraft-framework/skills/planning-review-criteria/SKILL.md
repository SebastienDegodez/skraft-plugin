---
name: planning-review-criteria
description: Use when reviewing DISCUSS artefacts (stories, acceptance criteria, sprint plans) for INVEST quality, planning coherence, and DoR compliance. Contains gate definitions G1-G8 and scoring rubric for the backlog-planner-reviewer lenses.
---

# Planning Review Criteria

## Overview

Formal gate definitions and verdict rubric for the `backlog-planner-reviewer`. Applied across 4 lenses (invest, ac-quality, planning-coherence, dor-compliance) covering 8 gates (G1–G8).

A story that passes all 8 gates is approved to enter DESIGN. A story with any blocking finding is rejected and must return to DISCUSS.

---

## Gate Definitions (G1–G8)

### Lens 1: invest-lens

| Gate | ID | Definition | Pass condition | Severity |
|---|---|---|---|---|
| INVEST compliance | G1 | Each story satisfies all 6 INVEST criteria (Independent, Negotiable, Valuable, Estimable, Small, Testable). | All criteria pass for every story. Any failing criterion is flagged by name. | HIGH |
| Sprint independence | G2 | All stories are independently deliverable. No circular dependencies exist in the sprint. | Dependency graph is a valid DAG. No story waits for a non-existent story. | HIGH |

**Checking G1:** For each story, verify each INVEST criterion individually. A single failing criterion = G1 fail for that story. Document which criterion and why.

**Checking G2:** Build an adjacency list from `Dependencies` fields. Run DFS. Any back-edge = cycle = G2 violation. Report the cycle path.

---

### Lens 2: ac-quality-lens

| Gate | ID | Definition | Pass condition | Severity |
|---|---|---|---|---|
| AC completeness | G3 | Every story has ≥3 ACs. Each AC is in Given/When/Then or bullet-list format. Zero ACs are implementation steps. | 3+ ACs per story, correct format, no implementation prescriptions. | HIGH |
| AC unambiguity | G4 | No AC has two valid interpretations by a domain expert with no code knowledge. | Every AC resolves to a single unambiguous outcome. | BLOCKER |

**G3 check steps:**
1. Count ACs per story — flag any story with fewer than 3
2. For each AC, verify format: Given/When/Then or clean bullet list
3. Scan for implementation instructions: method calls, HTTP verbs, class names → G3 violation

**G4 red flags (auto-fail):**
- HTTP status codes: `200`, `201`, `422`, `404`, `500`
- HTTP verbs in step text: `POST`, `GET`, `PUT`, `DELETE`
- Class/method names: `EligibilityService`, `.Check()`, `DriverRepository`
- Framework terms: `Controller`, `Handler`, `UseCase`, `DI container`
- Vague quantifiers without thresholds: "fast response", "good performance"
- Dual-interpretation steps: "the driver is notified" (by email? by UI? by SMS?)

---

### Lens 3: planning-coherence-lens

| Gate | ID | Definition | Pass condition | Severity |
|---|---|---|---|---|
| Milestone scope | G5 | Stories fit the milestone theme. No story spans multiple sprint themes without decomposition. | Every story aligns with the milestone's stated theme and time-box. | HIGH |
| Dependency DAG | G6 | No circular dependencies. Delivery sequence respects topological order. | Dependency graph is a DAG. Sequencing is derivable without ambiguity. | BLOCKER |

**G5 check:** For each story, ask: does this story's outcome belong in the milestone theme? If a story touches a different user journey segment than the milestone theme (e.g., a payment story in the `v0.2-eligibility` milestone), flag G5.

**G6 cycle detection:** Build adjacency list. DFS. Any back-edge = BLOCKER. Report the exact cycle: `Story-A → Story-B → Story-C → Story-A`.

---

### Lens 4: dor-compliance-lens

| Gate | ID | Definition | Pass condition | Severity |
|---|---|---|---|---|
| DoR 8-item gate | G7 | Every story passes ALL 8 DoR items: problem statement, specific persona, 3+ domain examples, UAT scenarios, AC derived from UAT, right-sized, technical notes, dependencies. | 8/8 items pass for every story. | BLOCKER |
| Antipattern absence | G8 | Zero CRITICAL antipatterns (Implement-X, Giant Stories, No Examples). Zero HIGH antipatterns (Technical AC, Generic Data, Tests After Code, Vague Persona, Missing Dependencies). | No CRITICAL antipatterns detected. No HIGH antipatterns detected. | BLOCKER (CRITICAL); HIGH (HIGH severity antipatterns) |

**G7 minimum verdict impact:** If 2+ DoR items fail on the same story → that story's verdict is `rejected` regardless of other findings.

**G8 auto-reject triggers:**
- Story persona is a developer/engineer/architect
- Story capability verb is "implement", "build", "refactor", "create a service"
- Story has 8+ ACs and no split plan
- Story has zero domain examples with real values

---

## INVEST Scoring Rubric

For each of the 6 INVEST criteria, this rubric defines what a passing story looks like.

| Criterion | Pass condition | Fail conditions | Failure severity | Remediation |
|---|---|---|---|---|
| **Independent** | Story has no unresolved implicit prerequisites. Any dependency is explicit and listed. | Story references another story's output without listing it as a dependency. Story uses "continuing from..." | HIGH | List dependency explicitly, or split to make story self-contained |
| **Negotiable** | Story describes observable user behaviour. No implementation technology prescribed. | Story contains class/method names, HTTP contracts, framework prescriptions in the story body (not Technical Notes). | HIGH | Move implementation constraints to Technical Notes |
| **Valuable** | Delivery of this story alone creates a user-visible or business-visible outcome. | Story describes developer work only (refactoring, test coverage, migrations) with no user-visible outcome. | HIGH | Wrap technical work in user-visible consequence, or remove from DISCUSS |
| **Estimable** | Team can size the story in ≤5 minutes with high confidence. ACs and Technical Notes are present. | Story has no ACs. Story has major unknowns with no Technical Notes. Team disagrees on scope boundaries. | HIGH | Write ACs first; add spike story for unknowns; clarify scope |
| **Small** | Effort is XS, S, or M. L is acceptable with tight ACs. XL is always a failure. | Effort estimate is XL. Story has 6+ ACs. Story touches 3+ distinct user actions. | HIGH (L with loose scope); BLOCKER (XL) | Apply splitting pattern. XL must be split before DoR can be claimed. |
| **Testable** | At least 3 ACs in G/W/T or bullet format derived from domain examples. | No ACs written. ACs describe code quality, not user outcomes. AC says "works correctly". | HIGH | Add domain examples first; derive ACs from each example |

---

## AC Quality Rules

Apply to every AC in every `ac-draft-{story}.md` file:

| Rule | Description |
|---|---|
| **One trigger per AC** | A Given/When/Then AC has exactly ONE When step. Multiple Whens = multiple ACs. |
| **Observable outcome** | The Then step describes what the USER sees or experiences, never what happens inside the system. |
| **Domain vocabulary only** | Every noun and verb in a G/W/T step must be understandable by a domain expert with no code knowledge. |
| **Independent testability** | Each AC is independently verifiable. Two ACs do not test the same scenario. |
| **Traceability** | Each AC traces to a domain example or UAT scenario. ACs without a source are fabrications. |
| **Measurable conditions** | Quantitative ACs include thresholds: "within 2 seconds", "at least 3 attempts", not "quickly" or "several". |

---

## DoR Validation — Per-Item Severity

| DoR Item | Minimum severity if missing | Minimum verdict if missing |
|---|---|---|
| 1. Problem statement (Implement-X detected) | BLOCKER | `rejected` |
| 2. Specific persona (Vague Persona detected) | HIGH | `changes_requested` |
| 3. 3+ domain examples (0 examples) | BLOCKER | `rejected` |
| 3. 3+ domain examples (1-2 examples) | HIGH | `changes_requested` |
| 4. UAT scenarios | HIGH | `changes_requested` |
| 5. AC derived from UAT | HIGH | `changes_requested` |
| 6. Right-sized (XL estimate) | BLOCKER (XL) / HIGH (L loose) | `rejected` (XL) / `changes_requested` (L) |
| 7. Technical notes | HIGH if integration exists | `changes_requested` |
| 8. Dependencies (undeclared dependency found) | HIGH | `changes_requested` |

**G7 aggregate rule:** If a story has 2+ missing DoR items of any severity → minimum verdict is `rejected`.

---

## Antipattern Severity Table

| Antipattern | ID | Severity | Lens | Minimum verdict impact |
|---|---|---|---|---|
| Implement-X | AP-DISCUSS-01 | CRITICAL | dor-compliance | `rejected` |
| No Examples | AP-DISCUSS-05 | CRITICAL | dor-compliance | `rejected` |
| Giant Stories | AP-DISCUSS-04 | CRITICAL | invest | `rejected` |
| Technical AC | AP-DISCUSS-03 | HIGH | ac-quality | `changes_requested` |
| Generic Data | AP-DISCUSS-02 | HIGH | dor-compliance | `changes_requested` |
| Tests After Code | AP-DISCUSS-06 | HIGH | ac-quality | `changes_requested` |
| Vague Persona | AP-DISCUSS-07 | HIGH | dor-compliance | `changes_requested` |
| Missing Dependencies | AP-DISCUSS-08 | HIGH | planning-coherence | `changes_requested` |

---

## Planning Red Flags

Patterns in sprint plans that signal a failing review, independent of individual story quality:

| Red flag | Impact | Minimum verdict |
|---|---|---|
| All stories are Must Have with no Should/Could Haves | Sprint has no flexibility to cut when overloaded | `changes_requested` (G5) |
| Total story-days > sustainable capacity | Sprint is overloaded; engineers will cut corners | `changes_requested` (G5) |
| Two or more XL stories in the same sprint | At least one XL was not split before planning | `rejected` (G1 — Not Small) |
| Circular dependency in sprint | Sprint cannot be delivered in topological order | `rejected` (G6 — BLOCKER) |
| A story depends on a story not in the sprint with no "already done" confirmation | Story B may start before Story A ships | `changes_requested` (G2) |

---

## Verdict Derivation Table

| Condition | Verdict |
|---|---|
| ≥1 BLOCKER finding across any lens | `rejected` |
| ≥1 HIGH finding, 0 BLOCKER | `changes_requested` |
| MEDIUM findings only | `changes_requested` |
| LOW findings only | `approved` with recommendations |
| No findings | `approved` |

**Confidence levels:**
- `high`: All required artefacts present; all lenses fully applied
- `medium`: Context artefacts (triage report) missing; some inferences made
- `low`: Required artefacts partially missing; lenses applied on incomplete data

---

## References

- [gate-definitions.md](references/gate-definitions.md) — G1-G8 per-gate checklists with pass/fail examples
- [invest-scoring.md](references/invest-scoring.md) — INVEST per-criterion scoring rubric
- [dor-scoring.md](references/dor-scoring.md) — DoR per-item rubric with severity table
- [antipattern-severity.md](references/antipattern-severity.md) — antipattern detection checklist and verdict impact
- [verdict-rubric.md](references/verdict-rubric.md) — verdict derivation with 3 example verdicts
