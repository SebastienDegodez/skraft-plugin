---
layout: doc
lang: en
title: "acceptance-review-criteria"
description: "Use when reviewing DISTILL artefacts (Gherkin scenarios, test plans, implementation plans) for quality, completeness,..."
persona: tech-lead
---

# acceptance-review-criteria

> Gate definitions and verdict rubric for the DISTILL reviewer — applied across 4 lenses (coverage, business-alignment, testability, boundary-enforcement).

## When to use

- When the `acceptance-designer-reviewer` runs a review pass on DISTILL artefacts
- To evaluate the quality of Gherkin scenarios, test plans, and implementation plans
- To derive a formal verdict (`approved`, `changes_requested`, `rejected`) from lens findings

## Entry contract

- `ac-draft-{story}.md` — story acceptance criteria
- `*.feature` files — Gherkin scenarios
- `impl-plan-{story}.md` — implementation plan with file paths and use case boundaries
- `contracts-{story}.md` — Application layer interfaces

## Exit contract

- Formal verdict: `approved`, `changes_requested`, or `rejected`
- List of findings per lens, each tagged with severity (`BLOCKER`, `HIGH`, `MEDIUM`, `LOW`)
- Confidence level (`high`, `medium`, `low`) based on artefact completeness

## Invariants

- **9 gates (G1–G9)** spread across 4 lenses — no gate may be skipped
- **A single BLOCKER forces `rejected`** — G1, G4, G7 are always BLOCKERs
- **No silent correction** — a minority finding is always documented even when overridden
- **Dissent is traced** — when 3 lenses pass and 1 fails, the override reasoning is explicit

| Gate | Lens | Severity | Short definition |
|------|------|----------|-----------------|
| G1 | Coverage | BLOCKER | AC → scenario bijection: every AC has ≥1 scenario, no orphan scenario |
| G2 | Coverage | HIGH | ≥1 scenario covers a boundary condition per business rule |
| G3 | Business Alignment | HIGH | All Given/When/Then terms belong to the domain vocabulary |
| G4 | Business Alignment | BLOCKER | Zero implementation details in Gherkin steps |
| G5 | Testability | HIGH | Every step is unambiguous in the domain vocabulary |
| G6 | Testability | HIGH | Feature scenarios ↔ implementation plan entries bijection |
| G7 | Boundary Enforcement | BLOCKER | Every coverage-matrix row targets an Application use case boundary |
| G8 | Boundary Enforcement | HIGH | ≥1 walking skeleton scenario per major feature flow |
| G9 | Boundary Enforcement | HIGH | Every `@visual`-tagged scenario has ≥1 matching Playwright E2E spec in `tests/e2e/` |

## Why this shape

Adversarial lens-by-lens reviews reduce confirmation bias: each lens applies a single criterion in isolation without being influenced by others. The DELIVER team — engineers, testers, architects — consumes DISTILL artefacts. A scenario contaminated with technical jargon or an AC without a matching scenario translates directly into cycle debt.

> « Specifications that are automatically verifiable provide concrete examples of desired system behaviour. »
> — Adzic, G., *Specification by Example*, 2011.

## Allowed customisation

- Confidence threshold at which a review is considered incomplete (L2)
- Dissent messages (L1)
- Severity of gates G2, G5, G6, G8, G9 (L2 — do not lower below HIGH)

## See also

- [adversarial-review-lenses]({{ "/en/reference/skills/adversarial-review-lenses" | relative_url }}) — Independent-lens verdict procedure
- [bdd-methodology]({{ "/en/reference/skills/bdd-methodology" | relative_url }}) — Authoring Gherkin scenarios
- [acceptance-designer]({{ "/en/reference/agents/acceptance-designer" | relative_url }}) — Agent that produces DISTILL artefacts
