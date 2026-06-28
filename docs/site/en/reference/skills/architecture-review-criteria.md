---
layout: doc
lang: en
title: "architecture-review-criteria"
description: "Use when reviewing DESIGN artefacts (event models, ADRs, component diagrams, context maps, interface contracts) for q..."
persona: tech-lead
---

# architecture-review-criteria

> 15 gates across 3 lenses and 1 cross-cutting escalation gate, applied by the `solution-architect-reviewer` on DESIGN artefacts.

## When to use

- When the `solution-architect-reviewer` runs a review pass on DESIGN artefacts
- To verify DDD compliance, Clean Architecture adherence, and fitness for the stories in scope
- To derive a formal verdict on ADRs, event models, component diagrams, context maps, and interface contracts

## Entry contract

- ADRs (`adr-{NNN}-{slug}.md`), supersession registry (`docs/adr/supersessions.md`)
- Event models, component diagrams, context maps
- Interface contracts (`contracts-{story}.md`), consistency matrices (`consistency-matrix-{story}.md`)
- Blocker files (`decision-drift-{story}-{NNN}.md`) under `blockers/{date}/`

## Exit contract

- Formal verdict: `approved`, `changes_requested`, or `rejected`
- Findings per lens and per gate with severity (`BLOCKER`, `HIGH`, `MEDIUM`, `LOW`)
- When G13 is open: immediate `REJECTED` without evaluating other gates

## Invariants

- **G13 is a short-circuit gate** — an open blocker file with no resolution suspends the entire review
- **G1 back-fill required** — patterns detected in existing code without a corresponding ADR must be covered
- **G14: never encode verdict in an ADR filename**
- **G15: no ADR that restates the project baseline** (CQS at method level, layer boundaries, convention-based DI registration)

| Gate | Lens | Severity | Subject |
|------|------|----------|---------|
| G1 | Consistency | BLOCKER | Every structural commitment has a traceable `Accepted` ADR |
| G2 | Consistency | BLOCKER | No ADR contradicts another; supersessions are registered |
| G3 | Arch Compliance | BLOCKER | Dependency rule: Domain and Application do not import Infrastructure or API |
| G4 | Arch Compliance | BLOCKER | All application interfaces are defined in the Application layer |
| G5 | Arch Compliance | HIGH | Each aggregate enforces only its own invariants |
| G6 | Arch Compliance | HIGH | All context map relationships are labelled and admissible |
| G7 | Fitness | HIGH | Every DISCUSS story maps to at least one Command or Query in the event model |
| G8 | Fitness | HIGH | Every Command has at least one corresponding domain event |
| G9 | Fitness | MEDIUM | No architectural element without story traceability |
| G10 | Consistency | BLOCKER | `consistency-matrix-{story}.md` exists for each story, gate PASS |
| G11 | Fitness | HIGH | Every ADR adopting a complexity-adding pattern cites at least one admissible force |
| G12 | Consistency | BLOCKER | Every row in `supersession-plan-{story}.md` is realised (ADR + registry + artefacts) |
| G13 | Escalation | BLOCKER | Every blocker file has a sibling `-resolution.md` |
| G14 | Consistency | BLOCKER | No ADR filename carries a verdict |
| G15 | Fitness | HIGH | No ADR restates a project baseline constraint |

## Why this shape

Adversarial review across independent lenses ensures that DDD compliance (lens 2), story fitness (lens 3), and cross-artefact consistency (lens 1) are evaluated separately. Human escalation (G13) is a short-circuit gate to prevent the review from progressing on an ambiguous foundation.

> « The goal of software architecture is to minimize the human resources required to build and maintain the required system. »
> — Martin, R. C., *Clean Architecture*, 2017.

## Allowed customisation

- Severity of gates G5, G6, G7, G8, G9, G11, G15 (L2 — do not lower below HIGH for G5–G8, G11)
- Additional patterns that trigger G11 (L2)

## See also

- [adversarial-review-lenses]({{ "/en/reference/skills/adversarial-review-lenses" | relative_url }}) — Independent-lens verdict procedure
- [architecture-patterns]({{ "/en/reference/skills/architecture-patterns" | relative_url }}) — Catalogue of patterns verified by these gates
- [architecture-decisions]({{ "/en/reference/skills/architecture-decisions" | relative_url }}) — ADR template and lifecycle
- [solution-architect-reviewer]({{ "/en/reference/agents/solution-architect-reviewer" | relative_url }}) — Agent that applies this skill
