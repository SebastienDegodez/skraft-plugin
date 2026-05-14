# Gate Definitions — G1–G9

## Overview

Detailed evaluation checklist for each of the 9 gates used by the `solution-architect-reviewer`. Each gate entry includes: which lens it belongs to, its definition, a step-by-step check procedure, auto-fail examples (concrete situations that immediately fail the gate), and pass examples.

---

## Lens 1 — consistency-lens

Evaluates: ADRs + diagrams + contracts

---

### G1 — Every Diagram Element Has an ADR Justification

**Lens:** consistency-lens
**Severity:** HIGH

**Definition:** Every structural element visible in component diagrams — aggregates, bounded contexts, architectural patterns (CQRS, Event Sourcing, Saga), context map relationships — must have a corresponding ADR that justifies its existence. No element is introduced without a recorded architectural rationale.

**Step-by-step check:**
1. Open all `diagrams-{story}.md` files. List every named architectural element: aggregates, bounded contexts, patterns.
2. Open all `adr-*.md` files. Build an index: `{ ADR number → decision topic }`.
3. For each element in step 1, search the ADR index for a justification.
4. Any element with no corresponding ADR → G1 fail.

**Auto-fail examples:**
- Diagram shows `EligibilityAggregate` with Event Sourcing notation, but no ADR exists that evaluates or accepts Event Sourcing for eligibility.
- Diagram shows an ACL between `EligibilityContext` and `PolicyContext`, but no ADR justifies this relationship pattern.
- A `EligibilityRenewalSaga` appears in the diagram with no ADR for the saga introduction.

**Pass examples:**
- Diagram shows `EligibilityAggregate`. ADR-001 accepts CQRS for eligibility; ADR-002 defines aggregate boundary. Both ADRs reference the eligibility aggregate explicitly. → G1 pass.
- Diagram shows ACL between contexts. ADR-003 accepts separated contexts with ACL and explains why Conformist was rejected. → G1 pass.

---

### G2 — No Contradicting ADRs

**Lens:** consistency-lens
**Severity:** BLOCKER

**Definition:** No two ADRs in the DESIGN artefact set contradict each other. If one ADR supersedes another, the superseded ADR must be marked `Superseded by ADR-{NNN}` and the successor must reference the superseded ADR in its Context section.

**Step-by-step check:**
1. Read all ADRs. Note the decision topic and chosen direction for each.
2. Look for conflicting decisions: same topic, different choices, both with status `Accepted`.
3. Check every ADR whose status is `Accepted` — verify no other `Accepted` ADR makes an incompatible choice for the same scope.
4. For any ADR marked `Superseded by ADR-{NNN}` — verify the successor ADR exists and references the superseded one.

**Auto-fail examples:**
- ADR-001 (status: Accepted) prescribes CQRS for eligibility. ADR-005 (status: Accepted) prescribes a single unified model for eligibility. Both are `Accepted`. → G2 BLOCKER fail.
- ADR-003 is marked `Superseded by ADR-007` but ADR-007 does not exist or does not reference ADR-003. → G2 BLOCKER fail.
- ADR-004 accepts Event Sourcing for `EligibilityAggregate`. ADR-006 (same scope, status: Accepted) rejects Event Sourcing for `EligibilityAggregate`. → G2 BLOCKER fail.

**Pass examples:**
- ADR-001 (Accepted): CQRS for eligibility. ADR-005 (Accepted): state-based persistence for policy renewal. Different scopes — no contradiction. → G2 pass.
- ADR-003 (Superseded by ADR-007): original ACL pattern decision. ADR-007 (Accepted): revised to Published Language, references ADR-003 in Context. → G2 pass.

---

## Lens 2 — architecture-compliance-lens

Evaluates: diagrams + contracts + event models

---

### G3 — Dependency Rule Not Violated

**Lens:** architecture-compliance-lens
**Severity:** BLOCKER

**Definition:** Domain and Application layers must not depend on Infrastructure or API layers. Source code dependencies point inward only.

**Step-by-step check:**
1. Open all `contracts-{story}.md` files. Identify which layer each interface and type belongs to (Domain, Application, Infrastructure, API).
2. Check Domain layer interfaces and types — do any reference Infrastructure or API types? → fail if yes.
3. Check Application layer interfaces — do any import or reference Infrastructure or API types (excluding DI registration, which is Infrastructure's concern)? → fail if yes.
4. Check diagrams for arrows pointing outward (Domain → Infrastructure, Application → Infrastructure in the wrong direction).

**Auto-fail examples:**
- `IEligibilityRepository` is listed under Domain layer in contracts and imports `SqlConnection` from Infrastructure. → G3 BLOCKER fail.
- `CheckEligibilityCommandHandler` (Application layer) directly instantiates `EligibilityDbContext` (Infrastructure type). → G3 BLOCKER fail.

**Pass examples:**
- `IEligibilityRepository` is listed under Application layer. `EligibilityRepository` (Infrastructure) implements it. Contracts show no Infrastructure types in Domain or Application. → G3 pass.

---

### G4 — Application Interfaces Defined in Application Layer

**Lens:** architecture-compliance-lens
**Severity:** BLOCKER

**Definition:** All application interfaces — repositories, gateways, event publishers, external service abstractions — must be defined in the Application layer. None may be defined in Infrastructure.

**Step-by-step check:**
1. List all interface types (names starting with `I`) in `contracts-{story}.md`.
2. For each interface, verify it is explicitly assigned to the Application layer in the contracts.
3. Check for any interface defined in the Infrastructure layer. → fail for each one found.

**Auto-fail examples:**
- `contracts-eligibility.md` lists `IEligibilityRepository` under Infrastructure layer. → G4 BLOCKER fail.
- An `IEventPublisher` interface is described as "defined in the messaging Infrastructure project." → G4 BLOCKER fail.

**Pass examples:**
- `contracts-eligibility.md` lists `IEligibilityRepository`, `IDriverHistoryGateway`, and `IEventPublisher` all under Application layer. Infrastructure implementations listed separately. → G4 pass.

---

### G5 — No Cross-Aggregate Invariant Enforcement

**Lens:** architecture-compliance-lens
**Severity:** HIGH

**Definition:** Each aggregate enforces only its own invariants. No aggregate holds a reference to another aggregate root (only IDs are allowed). No invariant spans two aggregates.

**Step-by-step check:**
1. Open all `diagrams-{story}.md`. For each aggregate, check its contained elements.
2. Look for direct object references to another aggregate root (not an ID value object). → fail if found.
3. Review `contracts-{story}.md` — look for command handlers or domain service signatures that load two aggregates to enforce a single invariant. → G5 fail if found.
4. Check aggregate method definitions in contracts — verify no method accepts another aggregate root as a parameter.

**Auto-fail examples:**
- `PolicyAggregate` in the diagram contains a `Driver` entity from `EligibilityAggregate`. → G5 HIGH fail.
- `EligibilityAggregate.Check(policy: PolicyAggregate)` — aggregate method accepts another aggregate root. → G5 HIGH fail.

**Pass examples:**
- `EligibilityAggregate` contains only `DriverHistory` (its own child entity) and references `DriverId` (value object) for cross-aggregate coordination. → G5 pass.

---

### G6 — Context Map Is Complete

**Lens:** architecture-compliance-lens
**Severity:** HIGH

**Definition:** Every inter-context relationship in the context map is labelled with an explicit pattern (ACL, Conformist, Shared Kernel, Partnership, OHS, Published Language). No arrow between bounded contexts is unlabelled.

**Step-by-step check:**
1. Open `context-map.md`. List every arrow between bounded contexts.
2. For each arrow, verify it has a label that is one of the recognised patterns.
3. Any unlabelled arrow → G6 HIGH fail.
4. Check diagrams for any inter-context connection not visible in the context map. → G6 HIGH fail.

**Auto-fail examples:**
- `context-map.md` shows `EligibilityContext → PolicyContext` with no label. → G6 HIGH fail.
- A diagram shows `EligibilityContext` consuming from `NotificationContext` but this relationship does not appear in the context map. → G6 HIGH fail.

**Pass examples:**
- `context-map.md` shows `EligibilityContext →|ACL| PolicyContext` and `PolicyContext →|Published Language: PolicyEvents| AuditContext`. All arrows labelled. → G6 pass.

---

## Lens 3 — fitness-lens

Evaluates: diagrams + contracts + stories

---

### G7 — Every Story Has a Command or Event

**Lens:** fitness-lens
**Severity:** HIGH

**Definition:** Every story from `stories-{milestone}.md` maps to at least one command, domain event, or read model in the event model or contracts.

**Step-by-step check:**
1. List all story IDs from `stories-{milestone}.md` (e.g., US-01, US-02, US-03).
2. Open all `event-model-{story}.md` and `contracts-{story}.md` files.
3. For each story ID, search for at least one reference — a command name, event name, or read model — that corresponds to that story's trigger or outcome.
4. Any story with no corresponding element → G7 HIGH fail.

**Auto-fail examples:**
- Story US-03 (Driver renews eligibility before expiry) exists in `stories-milestone-1.md`. No `RenewEligibility` command or `EligibilityRenewed` event appears in any event model. → G7 HIGH fail.

**Pass examples:**
- US-01 maps to `CheckEligibility` command and `EligibilityChecked` event. US-02 maps to `DenyEligibility` command and `EligibilityDenied` event. US-03 maps to `RenewEligibility` command. All stories covered. → G7 pass.

---

### G8 — No Dangling Commands

**Lens:** fitness-lens
**Severity:** HIGH

**Definition:** Every command in the contracts has at least one corresponding domain event. A command with no domain event cannot be verified and represents an incomplete design.

**Step-by-step check:**
1. List all commands from `contracts-{story}.md`.
2. For each command, find its corresponding domain event(s) in contracts or diagrams.
3. Any command with no corresponding event → G8 HIGH fail.

**Auto-fail examples:**
- `RenewEligibility` command is defined in contracts. No `EligibilityRenewed` event appears in contracts or diagrams. → G8 HIGH fail.
- `ArchiveDriver` command is defined. No corresponding event. → G8 HIGH fail.

**Pass examples:**
- `CheckEligibility` → `EligibilityChecked` (success path) + `EligibilityDenied` (rejection path). Both events defined. → G8 pass.

---

### G9 — No Unjustified Architectural Elements

**Lens:** fitness-lens
**Severity:** MEDIUM

**Definition:** Every aggregate, bounded context, Event Sourcing adoption, Saga, or pattern introduction must trace back to at least one story in `stories-{milestone}.md`. No element is introduced "in anticipation of future needs."

**Step-by-step check:**
1. List all structural elements: aggregates, bounded contexts, patterns (Event Sourcing, Saga, CQRS variants).
2. For each element, find the story that necessitates it.
3. If the element is justified only by "future requirements" or "might be useful" → G9 MEDIUM fail.

**Auto-fail examples:**
- Diagram includes a `FraudDetectionContext` bounded context. No story in the current milestone involves fraud detection. → G9 MEDIUM fail.
- `EligibilityRenewalSaga` is designed but no story in scope involves a multi-step renewal workflow across aggregates. → G9 MEDIUM fail.
- Event Sourcing is applied to `EligibilityAggregate` but neither an audit trail nor a temporal query story exists in the current milestone. → G9 MEDIUM fail.

**Pass examples:**
- `EligibilityAggregate` is introduced. Story US-01 (eligibility check) requires it. → G9 pass.
- `EligibilityRenewalSaga` introduced. Story US-05 (renewal triggered by expiry, notification sent) explicitly requires cross-aggregate coordination. → G9 pass.
