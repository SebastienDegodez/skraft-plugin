# Gate Definitions — G1–G13

## Overview

Detailed evaluation checklist for each of the 13 gates used by the `solution-architect-reviewer` (12 lens-bound + 1 cross-cutting escalation gate). Each gate entry includes: which lens it belongs to, its definition, a step-by-step check procedure, auto-fail examples (concrete situations that immediately fail the gate), and pass examples.

---

## Lens 1 — consistency-lens

Evaluates: ADRs + diagrams + contracts

---

### G1 — Every Diagram Element Has an ADR Justification

**Lens:** consistency-lens
**Severity:** BLOCKER

**Definition:** Every structural element visible in component diagrams — aggregates, bounded contexts, architectural patterns (CQRS, Event Sourcing, Saga), context map relationships — must have a corresponding ADR that justifies its existence. No element is introduced without a recorded architectural rationale. (Bumped to BLOCKER: ungrounded structural elements propagate silently into DISTILL and DELIVER as faith-based dependencies.)

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

### G2 — No Contradicting ADRs (and Supersession is Bidirectional via Registry)

**Lens:** consistency-lens
**Severity:** BLOCKER

**Definition:** No two ADRs in the DESIGN artefact set contradict each other while both are `Accepted`. When one ADR supersedes another, the link is recorded in two places:

1. **Inside the new ADR's body**, immediately after the Status line: `**Supersedes:** [ADR-MMM](./ADR-MMM-{slug}.md) — {one-line reason}`.
2. **As an appended row in `docs/adr/supersessions.md`** (append-only registry):

   ```markdown
   | date | superseded ADR | new ADR | reason |
   |---|---|---|---|
   | 2026-05-16 | ADR-003 | ADR-007 | Conformist now justified — ACL is over-engineering |
   ```

The superseded ADR's file is **never** edited — the `docs/adr/` directory is append-only. Reviewers reconstruct the supersession graph from these two sources combined.

**Step-by-step check:**
1. Read all ADRs. Note the decision topic and chosen direction for each.
2. Look for conflicting decisions: same scope, incompatible choices, both `Accepted`.
3. For every `**Supersedes:** ADR-MMM` body line found in any ADR: open `docs/adr/supersessions.md` and confirm a registry row exists for that pair (same superseded ADR, same new ADR). If missing → G2 BLOCKER.
4. For every row in `docs/adr/supersessions.md`: open the named new ADR and confirm the `**Supersedes:**` body line exists. If missing → G2 BLOCKER.
5. Do **not** demand any edit to the superseded ADR's file — expecting one is itself the wrong mental model.

**Auto-fail examples:**
- ADR-001 (Accepted) prescribes CQRS for eligibility. ADR-005 (Accepted) prescribes a single unified model for eligibility. Both `Accepted`, same scope. → G2 BLOCKER fail.
- ADR-007 contains `**Supersedes:** ADR-003` but `docs/adr/supersessions.md` has no row pairing ADR-003 → ADR-007. → G2 BLOCKER fail.
- `docs/adr/supersessions.md` lists `ADR-003 → ADR-007` but ADR-007's body lacks the `**Supersedes:**` line. → G2 BLOCKER fail.

**Pass examples:**
- ADR-001 (Accepted): CQRS for eligibility. ADR-005 (Accepted): state-based persistence for policy renewal. Different scopes — no contradiction. → G2 pass.
- ADR-007 body contains `**Supersedes:** [ADR-003](./adr-003-eligibility-acl.md) — Conformist now justified by shared RiskProfile VO`. `docs/adr/supersessions.md` contains a matching row dated today. → G2 pass.

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

---

### G10 — Consistency Matrix Exists and Passes

**Lens:** consistency-lens
**Severity:** BLOCKER

**Definition:** For every story under design there must be a `details/{date}/consistency-matrix-{story}.md` produced by the persona's Phase 9 RECONCILE & VERIFY, and its `consistency-gate` line must read `PASS`. The matrix's back-propagation journal must explain every rewrite the persona performed during reconciliation.

**Step-by-step check:**
1. List the stories under design from `plans/{date}/stories-{milestone}.md`.
2. For each story ID, confirm `details/{date}/consistency-matrix-{story}.md` exists.
3. Inside each matrix, locate the `consistency-gate:` line and confirm it equals `PASS`.
4. Spot-check the back-propagation journal: every row that was reconciled must have a journal entry naming the artefact rewritten and the cause class.
5. Any missing file, missing `PASS`, or missing journal entry → G10 BLOCKER fail.

**Auto-fail examples:**
- Stories under design are US-01, US-02. Only `consistency-matrix-US-01.md` exists. → G10 BLOCKER fail.
- `consistency-matrix-US-01.md` exists but its `consistency-gate` line reads `FAIL` and no blocker file was emitted. → G10 BLOCKER fail (this is a persona bug — reviewer must reject it explicitly rather than continue past it).

**Pass examples:**
- One matrix per story under design, every `consistency-gate: PASS`, journals coherent. → G10 pass.

---

### G11 — Complexity-Adding Pattern Has an Admissible Force and a "Do Without" Alternative

**Lens:** fitness-lens
**Severity:** HIGH

**Definition:** Every ADR that ratifies a pattern from `{CQRS, Event Sourcing, Saga, eventual consistency, micro-service split, ACL}` must cite at least one **admissible force** in its Context section AND must contain a row in `Alternatives Rejected` titled `"do without the pattern"` evaluated on technical merits.

Admissible forces:
- Read/write asymmetry (very different shapes, scales, or freshness requirements)
- Audit trail or temporal-query requirement traceable to a story
- Cross-service transactional boundary that cannot be a single ACID transaction
- Contention hotspot demonstrably blocking throughput
- Regulatory separation requirement

`"Consistency with existing code"` is **not** an admissible force on its own.

**Step-by-step check:**
1. List every ADR whose decision adopts a pattern from the list above.
2. For each such ADR, open it and search the Context section for one of the admissible-force phrases.
3. Open the `Alternatives Rejected` section and confirm a row exists titled `"do without the pattern"` (or equivalent) with technical reasoning, not just a one-line dismissal.
4. Missing admissible force OR missing `"do without"` row → G11 HIGH fail.

**Auto-fail examples:**
- ADR-002 adopts CQRS for eligibility. Context says only: "We use CQRS to stay consistent with the rest of the codebase." → G11 HIGH fail.
- ADR-004 adopts Event Sourcing. `Alternatives Rejected` has only `"state-based persistence"` evaluated, with no `"do without Event Sourcing entirely"` row. → G11 HIGH fail.

**Pass examples:**
- ADR-002 adopts CQRS. Context cites: "Story US-03 requires real-time read of running policy count for 10× the write throughput — read/write asymmetry is the load-bearing force." `Alternatives Rejected` includes `"single model without CQRS"` analysed against the asymmetry. → G11 pass.

---

### G12 — Every Planned Supersession Is Realised in Both Places

**Lens:** consistency-lens
**Severity:** BLOCKER

**Definition:** For every row in any `details/{date}/supersession-plan-{story}.md` produced by the persona's Phase 3.5, ALL THREE of the following must hold:

1. The new ADR (named in the plan row's "New ADR to write" column) exists at `docs/adr/adr-{nnn}-{slug}.md` AND its body contains the line `**Supersedes:** [ADR-MMM](./ADR-MMM-{slug}.md) — {reason}`.
2. `docs/adr/supersessions.md` contains a row pairing the old ADR with the new ADR.
3. No descriptive artefact (`event-model-*.md`, `diagrams-*.md`, `contracts-*.md`) still cites the superseded ADR as its current source of truth (historical narrative references are fine; what is forbidden is descriptive artefacts pointing at the superseded ADR for current ratification).

**Step-by-step check:**
1. List every supersession plan file. Read every row.
2. For each row, open the named new ADR and `grep` for `**Supersedes:** ADR-{MMM}` — fail if absent.
3. Open `docs/adr/supersessions.md` and `grep` for a row matching the (old, new) pair — fail if absent.
4. `grep` every descriptive artefact for the superseded ADR token (`ADR-{MMM}`). For each hit, classify: narrative/history mention (OK) vs source-of-truth citation (FAIL).
5. Any of the three conditions missing → G12 BLOCKER fail.

**Auto-fail examples:**
- `supersession-plan-US-03.md` plans `ADR-003 → ADR-007`. ADR-007 exists but body lacks `**Supersedes:**`. → G12 BLOCKER fail.
- Plan row exists; new ADR has the body line; but `docs/adr/supersessions.md` does not yet carry the row. → G12 BLOCKER fail.
- `diagrams-US-03.md` still contains "per ADR-003" as a current-ratification reference for a relationship that is now governed by ADR-007. → G12 BLOCKER fail.

**Pass examples:**
- Plan row `ADR-003 → ADR-007`. ADR-007 body line present. Registry row present. `diagrams-US-03.md` updated to cite ADR-007; only the new ADR's own Context mentions ADR-003 (historical). → G12 pass.

---

### G13 — Open Blockers Force Escalation (Cross-Cutting Short-Circuit Gate)

**Lens:** cross-cutting (evaluated in Phase 1 RECEIVE, before any lens runs)
**Severity:** BLOCKER (short-circuit)

**Definition:** For every `decision-drift-{story}-{NNN}.md` file under `.copilot-tracking/skraft-plans/{projectSlug}/blockers/{date}/`, a sibling file `decision-drift-{story}-{NNN}-resolution.md` must exist in the same directory. An open blocker without a resolution means a human still owes an answer; the review is not the place to skip past that.

**Step-by-step check:**
1. List every file matching `blockers/{date}/decision-drift-*.md` (excluding files whose name already ends in `-resolution.md`).
2. For each, compute the expected sibling resolution filename by inserting `-resolution` before `.md`.
3. Check whether the sibling file exists. Missing sibling → G13 BLOCKER fail.
4. If any G13 fails: return `verdict: REJECTED` immediately, list the open blocker files in `synthesis.blocking_findings`, and SKIP all other lens evaluation. The verdict's `recommendations` must direct the orchestrator to surface the question to a human, not to retry the persona.

**Auto-fail examples:**
- `blockers/2026-05-16/decision-drift-US-03-001.md` exists. `blockers/2026-05-16/decision-drift-US-03-001-resolution.md` does not. → G13 BLOCKER fail, verdict `REJECTED`, lenses skipped.

**Pass examples:**
- No blocker files exist at all. → G13 pass (vacuously).
- Two blocker files exist; both have matching `-resolution.md` siblings; each resolution carries a `chosen: A|B|C` field. → G13 pass; reviewer proceeds to evaluate G1–G12 normally.
