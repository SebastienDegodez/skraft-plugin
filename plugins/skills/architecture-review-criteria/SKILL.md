---
name: architecture-review-criteria
description: Use when reviewing DESIGN artefacts (event models, ADRs, component diagrams, context maps, interface contracts) for quality, DDD compliance, and architectural correctness. Contains gate definitions and scoring rubric for the solution-architect-reviewer lenses.
---

# Architecture Review Criteria

## Overview

9 gates across 3 lenses, applied by the `solution-architect-reviewer` agent to DESIGN artefacts. Gates enforce DDD correctness, Clean Architecture compliance, and fitness for the stories in scope.

**Applied by:** `solution-architect-reviewer`
**Applied to:** ADRs, event models, component diagrams, context maps, interface contracts
**Prior phase required:** DESIGN artefacts from `solution-architect`

---

## Gate Definitions

### Lens 1 — consistency-lens

Evaluates: ADRs + diagrams + contracts

| Gate | Definition | Pass condition | Severity |
|---|---|---|---|
| G1 | Every structural element in a diagram (aggregate, bounded context, pattern) has a traceable ADR justification. No element exists without an architectural rationale. | All structural elements in all diagrams reference at least one ADR. | HIGH |
| G2 | No two ADRs contradict each other. If one ADR supersedes another, the superseded ADR is marked `Superseded by ADR-{NNN}`. | Zero contradicting decisions across all ADRs. Zero un-linked supersessions. | BLOCKER |

### Lens 2 — architecture-compliance-lens

Evaluates: diagrams + contracts + event models

| Gate | Definition | Pass condition | Severity |
|---|---|---|---|
| G3 | Dependency rule: Domain and Application layers have no dependencies on Infrastructure or API layers. | Zero imports of Infrastructure or API types in Domain or Application contracts. | BLOCKER |
| G4 | All application interfaces (repositories, gateways, event publishers) are defined in the Application layer contracts. None are defined in Infrastructure. | Zero infrastructure-defined interfaces in contracts. All I* interfaces listed under Application layer. | BLOCKER |
| G5 | Each aggregate enforces its own invariants. No aggregate enforces invariants that belong to another aggregate. | Zero cross-aggregate invariant references in contracts or diagrams. | HIGH |
| G6 | Context map declares every inter-context relationship with an explicit pattern (ACL, Conformist, Shared Kernel, Partnership, Open Host Service, Published Language). | Zero unlabelled arrows between bounded contexts in context-map.md. | HIGH |

### Lens 3 — fitness-lens

Evaluates: diagrams + contracts + stories

| Gate | Definition | Pass condition | Severity |
|---|---|---|---|
| G7 | Every story from DISCUSS maps to at least one command, event, or read model in the event model. | All story IDs from stories-{milestone}.md appear in at least one event model slice. | HIGH |
| G8 | Every command in contracts has at least one corresponding domain event. No dangling commands. | Zero commands without a corresponding domain event in contracts or diagrams. | HIGH |
| G9 | No aggregate, bounded context, Event Sourcing adoption, or Saga is introduced without a traceable story justification. | Zero unjustified architectural elements. Every element traces back to a story ID. | MEDIUM |

---

## Severity Definitions

| Severity | Definition | Impact |
|---|---|---|
| **BLOCKER** | Fundamental violation that invalidates the architecture. Cannot proceed to DISTILL. | Forces `rejected` verdict |
| **HIGH** | Significant flaw that will cause problems in DISTILL or implementation. Requires correction. | Forces `changes_requested` verdict |
| **MEDIUM** | Design smell or sub-optimal choice. Correction recommended before DISTILL. | Forces `changes_requested` verdict |
| **LOW** | Minor inconsistency or style issue. Can be noted and tracked. | May still yield `approved` with notes |

---

## Verdict Derivation Table

| Condition | Verdict |
|---|---|
| ≥1 BLOCKER finding | `rejected` |
| ≥1 HIGH finding, 0 BLOCKERs | `changes_requested` |
| MEDIUM findings only, 0 HIGH, 0 BLOCKER | `changes_requested` |
| LOW findings only | `approved` (with notes) |
| Zero findings | `approved` |

---

## DDD Compliance Rules Summary

1. Aggregates are identified by the invariants they enforce, not by their data
2. Cross-aggregate references use IDs only — never object references
3. Domain events are raised by aggregate roots, not application services
4. Repository interfaces live in Application layer, not Domain or Infrastructure
5. Bounded context boundaries map to language boundaries — if the same word means different things, there is a boundary
6. Context map relationships are explicit and labelled — implicit dependencies are forbidden
7. Subdomains are classified (Core/Supporting/Generic) and the investment level is justified

---

## YAGNI Detection Heuristics

Apply during G9 evaluation:

| Element | Question to ask |
|---|---|
| New bounded context | Which story requires this context to be separate? |
| New aggregate | Which invariant does this aggregate enforce? Which story produces that invariant? |
| Event Sourcing | Which story requires audit trail or temporal queries? |
| Saga | Which cross-aggregate workflow spans multiple stories? |
| ACL | Which conflicting model in the upstream context makes translation necessary? |

If the answer is "none" or "future needs" — flag as G9 MEDIUM violation.

---

## References

- [gate-definitions.md](references/gate-definitions.md) — Detailed checklist per gate (G1–G9) with step-by-step checks
- [ddd-violations.md](references/ddd-violations.md) — 8 DDD violation patterns detectable in artefacts
- [clean-arch-violations.md](references/clean-arch-violations.md) — 8 Clean Architecture violations detectable in contracts and diagrams
- [verdict-rubric.md](references/verdict-rubric.md) — Verdict derivation, confidence levels, and 3 example review verdicts
