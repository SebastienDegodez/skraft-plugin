---
name: architecture-review-criteria
description: Use when reviewing DESIGN artefacts (event models, ADRs, component diagrams, context maps, interface contracts) for quality, DDD compliance, and architectural correctness. Contains gate definitions and scoring rubric for the solution-architect-reviewer lenses.
---

# Architecture Review Criteria

## Overview

16 gates across 3 lenses, plus 1 cross-cutting escalation gate, applied by the `solution-architect-reviewer` agent to DESIGN artefacts. Gates enforce DDD correctness, Clean Architecture compliance, fitness for the stories in scope, cross-artefact consistency, the prohibition of negative or baseline-restating ADRs, and the integrity of the human-escalation protocol.

**Applied by:** `solution-architect-reviewer`
**Applied to:** ADRs, event models, component diagrams, context maps, interface contracts, consistency matrices, supersession plans, supersession registry, blocker files
**Prior phase required:** DESIGN artefacts from `solution-architect`

---

## Gate Definitions

### Lens 1 — consistency-lens

Evaluates: ADRs + supersession registry + diagrams + contracts + consistency matrices + supersession plans + blockers

| Gate | Definition | Pass condition | Severity |
|---|---|---|---|
| G1 | Every structural commitment — whether visible in a diagram OR detected in the existing codebase by Phase 7.0 grep signatures (`ICommandBus\|IQueryBus\|CommandBus\|QueryBus`, `IEventStore\|EventStream`, `Saga\|ProcessManager`, cross-context ACL) — has a traceable `Accepted` ADR justification. Back-fill ADRs are required when production code carries a structural pattern not yet covered by any ADR. | Every structural element in diagrams AND every grep hit from the persona's Step 7.0 detection table references at least one `Accepted` ADR. | BLOCKER |
| G2 | No two ADRs contradict each other. If one supersedes another, the supersession is recorded BOTH (a) inside the new ADR's body as `**Supersedes:** ADR-{MMM}` AND (b) as a row in the append-only `docs/adr/supersessions.md` registry. The superseded ADR file itself is never edited. | Zero contradicting `Accepted` decisions; for every supersession link, both registry row and new-ADR body line exist. | BLOCKER |
| G10 | A `consistency-matrix-{story}.md` exists for every story under design, and its `consistency-gate` line is `PASS`. The back-propagation journal explains every rewrite. | One matrix per story, all marked PASS, journals filled. | BLOCKER |
| G12 | Every row in a `supersession-plan-{story}.md` is realised: (a) new ADR contains the `**Supersedes:**` body line, (b) registry row exists in `docs/adr/supersessions.md`, (c) no descriptive artefact still cites the superseded ADR as its source of truth. | All three conditions hold for every planned supersession. | BLOCKER |
| G14 | No ADR encodes the verdict in the FILENAME: filenames must name the topic (`adr-NNN-event-sourcing.md`), never carry a verdict suffix (`*-rejected.md`, `*-accepted.md`, `*-deprecated.md`, `*-superseded.md`). The verdict belongs in the `Status:` frontmatter (`Proposed \| Accepted \| Rejected \| Deprecated \| Superseded`). A `Status: Rejected` ADR is admissible IFF a story or measurable force in this batch raised the question (per G9 traceability) AND the `Alternatives Rejected` section lists the option that was adopted instead. A `Rejected` ADR with no triggering story is a non-decision artefact. | Zero verdict-bearing filenames; every `Status: Rejected` ADR traces to a triggering story and names the adopted alternative. | BLOCKER |
| G16 | **Consumer convention consistency (issue #115).** When two or more contracts (`contracts-{story}.md`) define client-side consumers (React hooks, CLI adapters, SDK wrappers, ...) of ports/interfaces sharing the same shape class (e.g. both wrap a query port returning list data, both wrap a command port with optimistic update), their consumption conventions — loading/error/success state shape, naming of the returned tuple/object fields, cache-invalidation trigger, optimistic-update strategy — must be IDENTICAL or the divergence must be justified inline in the contract (a one-line "Diverges from `{other-consumer}` because {reason}" note). Divergence with no justification propagates as a DELIVER-phase finding (e.g. two hooks over comparable ports returning incompatible state shapes). | Every pair of comparable consumers either shares the same convention or carries an inline divergence justification in `contracts-{story}.md`. | HIGH |

### Lens 2 — architecture-compliance-lens

Evaluates: diagrams + contracts + event models

| Gate | Definition | Pass condition | Severity |
|---|---|---|---|
| G3 | Dependency rule: Domain and Application layers have no dependencies on Infrastructure or API layers. | Zero imports of Infrastructure or API types in Domain or Application contracts. | BLOCKER |
| G4 | All application interfaces (repositories, gateways, event publishers) are defined in the Application layer contracts. None are defined in Infrastructure. | Zero infrastructure-defined interfaces in contracts. All I* interfaces listed under Application layer. | BLOCKER |
| G5 | Each aggregate enforces its own invariants. No aggregate enforces invariants that belong to another aggregate. | Zero cross-aggregate invariant references in contracts or diagrams. | HIGH |
| G6 | Context map declares every inter-context relationship with an explicit pattern (ACL, Conformist, Shared Kernel, Partnership, Open Host Service, Published Language) AND every label is admissible: (a) no relationship labelled `Conformist` has a **Core** subdomain as its downstream; (b) no relationship labelled `Conformist` is in fact a published contract consumed with a local copy or translation (that is OHS/PL upstream + ACL downstream, see V-DDD-09 / V-DDD-10). | Zero unlabelled arrows between bounded contexts in context-map.md AND zero inadmissible labels. | HIGH |

### Lens 3 — fitness-lens

Evaluates: diagrams + contracts + stories + ADRs

| Gate | Definition | Pass condition | Severity |
|---|---|---|---|
| G7 | Every story from DISCUSS maps to at least one trigger (Command or Query) in the event model. Pure-read stories use a Query; state-changing stories use a Command. | All story IDs from stories-{milestone}.md appear in at least one event model slice as a Command or Query. | HIGH |
| G8 | Every **Command** has at least one corresponding domain event. Queries are exempt from this gate. No dangling commands. | Zero Commands without a corresponding domain event. Queries do not need events. | HIGH |
| G9 | No aggregate, bounded context, Event Sourcing adoption, or Saga is introduced without a traceable story justification. | Zero unjustified architectural elements. Every element traces back to a story ID. | MEDIUM |
| G11 | Every ADR adopting a complexity-adding pattern from `{CQRS, Event Sourcing, Saga, eventual consistency, micro-service split, ACL}` cites at least one admissible force in its Context AND has a `"do without the pattern"` row in `Alternatives Rejected`. `"Consistency with existing code"` alone is not admissible. | Admissible force present + `"do without"` alternative evaluated for every complexity-adding ADR. | HIGH |
| G15 | No ADR ratifies a constraint that is the project's enforced baseline. A constraint is **baseline** when it is enforced by a project skill (e.g. `clean-architecture-*`) OR by an automated architecture test (e.g. NetArchTest, ArchUnit, dependency-cruiser). Known baseline topics that must NOT appear as standalone ADRs: CQS at method level (one handler interface per command/query), Clean-Architecture layer boundaries, convention-based DI handler registration, repository pattern as such. ADRs about deviations from those baselines, or about *additions* on top of them (CQRS+Bus, Event Sourcing, custom DI strategy), remain valid. | Zero `Accepted` ADRs whose Decision restates an enforced baseline. Suspect titles: `Apply CQS`, `Use layered architecture`, `Use repositories`, `Register handlers via DI`. | HIGH |

---

### Cross-cutting — escalation gate

Evaluates: every `decision-drift-*.md` file under `.copilot-tracking/skraft-plans/{projectSlug}/blockers/{date}/`

| Gate | Definition | Pass condition | Severity |
|---|---|---|---|
| G13 | Every blocker file under `blockers/{date}/` has a sibling `-resolution.md` file containing the human's chosen answer. Open blockers (no sibling) mean the human owes an answer; the review is **not** the place to skip past that. | For every `decision-drift-{story}-{NNN}.md`, a sibling `decision-drift-{story}-{NNN}-resolution.md` exists. | BLOCKER (short-circuit) |

**Behaviour:** If G13 fails, the reviewer returns `REJECTED` immediately and does NOT evaluate any other gate. The verdict's `synthesis.blocking_findings` lists the open blocker files; the orchestrator's next action must be human escalation, not retry.

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
| Any blocker file under `blockers/{date}/` has no sibling `-resolution.md` (G13) | `REJECTED` — escalation pending, human must answer |
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
8. A Core subdomain is never the downstream of a `Conformist` relationship — it protects its Ubiquitous Language via an ACL. Consuming a published contract (ViewModel/event/DTO) with a local copy or translation is OHS/PL + ACL, never Conformist, regardless of how trivial the translation is

---

## YAGNI Detection Heuristics

Apply during G9 evaluation:

| Element | Question to ask |
|---|---|
| New bounded context | Which story requires this context to be separate? |
| New aggregate | Which invariant does this aggregate enforce? Which story produces that invariant? |
| Event Sourcing | Which story requires audit trail or temporal queries? |
| Saga | Which cross-aggregate workflow spans multiple stories? |
| ACL | Which conflicting model in the upstream context makes translation necessary, OR is the downstream a Core subdomain protecting its Ubiquitous Language? |

If the answer is "none" or "future needs" — flag as G9 MEDIUM violation.

---

## References

- [gate-definitions.md](references/gate-definitions.md) — Detailed checklist per gate (G1–G9) with step-by-step checks
- [ddd-violations.md](references/ddd-violations.md) — 10 DDD violation patterns detectable in artefacts
- [clean-arch-violations.md](references/clean-arch-violations.md) — 8 Clean Architecture violations detectable in contracts and diagrams
- [verdict-rubric.md](references/verdict-rubric.md) — Verdict derivation, confidence levels, and 3 example review verdicts
