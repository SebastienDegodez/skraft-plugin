# ADR Template

## Overview

This file provides the blank ADR template for direct copy-paste and a filled example from the auto-insurance (MonAssurance) domain.

---

## Blank Template

```markdown
# ADR-{NNN}: {Short Title}

**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-{NNN}
**Date:** {YYYY-MM-DD}

## Context

{Describe the situation and forces that led to this decision. What problem were you solving? What constraints were in play? What quality attributes or business requirements created the tension?}

## Decision

{State the decision clearly and directly. One paragraph. Start with "We will..." or "We have decided to...". Do not explain why here — that belongs in Context and Alternatives Rejected.}

## Consequences

**Positive:**
- {benefit 1}
- {benefit 2}

**Negative / trade-offs:**
- {trade-off 1}
- {trade-off 2}

**Neutral:**
- {change that is neither good nor bad but worth noting}

## Alternatives Rejected

| Alternative | Reason rejected |
|---|---|
| {option A} | {specific reason — not a strawman} |
| {option B} | {specific reason — not a strawman} |
```

---

## Filled Example 1: CQRS for Eligibility Check

```markdown
# ADR-001: Apply CQRS for Eligibility Check

**Status:** Accepted
**Date:** 2026-05-01

## Context

The eligibility check feature has distinct read and write concerns. The command side modifies eligibility state and raises the `EligibilityChecked` domain event. The query side needs to return a lightweight `EligibilityResult` read model optimised for display in the driver portal — a flat structure with only the fields the UI needs (eligible: bool, validUntil, rejectionReason).

Using a single domain model for both would force a compromise: either the domain model is polluted with display concerns (virtual properties, navigation properties), or the read model is burdened with invariant enforcement logic. Neither is acceptable.

The eligibility check is a Core subdomain feature and deserves proper investment in model separation.

## Decision

We will apply simple CQRS: separate command handlers (mutate state, raise domain events) from query handlers (return read models). Both sides share the same relational database. Command handlers write to the `eligibility` aggregate table via the domain model. Query handlers read from an `eligibility_read_model` projection table that is updated by an event handler reacting to `EligibilityChecked` and `EligibilityDenied` events.

## Consequences

**Positive:**
- Command and query models evolve independently — adding display fields does not touch the domain model
- Read models can be optimised (indexed, denormalised, cache-friendly) without affecting domain logic
- Aligns directly with the event model produced in the Event Modeling session
- Testing command handlers and query handlers is fully independent

**Negative / trade-offs:**
- Two code paths to maintain instead of one — command side and query side must both be updated when the feature changes
- Slight complexity increase for simple read features that do not diverge from the write shape
- Developers must understand which side to modify; onboarding overhead

**Neutral:**
- No separate database or event store required — simple CQRS with shared storage keeps operational overhead low

## Alternatives Rejected

| Alternative | Reason rejected |
|---|---|
| Single CRUD model (no CQRS) | Would mix mutation and query concerns; the domain model would need to expose display-optimised navigation properties, polluting the aggregate |
| Full CQRS with separate event store + read database | Over-engineering for current scale; no temporal query requirement exists yet; adds operational complexity before it is needed |
| CQRS with in-memory projections | Projections lost on restart; no persistence guarantee for the read model |
```

---

## Filled Example 2: Event Sourcing Rejected for Policy Renewal

```markdown
# ADR-002: Reject Event Sourcing for Policy Renewal

**Status:** Accepted
**Date:** 2026-05-02

## Context

During DESIGN for the policy renewal feature, Event Sourcing was evaluated. Policy renewal involves state changes (policy status transitions from Active → PendingRenewal → Active | Lapsed) and raises domain events (`PolicyRenewed`, `PolicyLapsed`).

The decision heuristic was applied: "Does knowing the history of policy state changes provide business value?"

Assessment:
- Audit trail: The policy audit is handled by a dedicated `AuditContext` that subscribes to domain events from the `PolicyContext`. The audit trail does not require Event Sourcing within `PolicyContext` itself.
- Temporal queries: No story in the current milestone requires querying historical policy states at a point in time.
- Multiple read models: The policy renewal feature requires two read models (driver-facing status, underwriter summary). Both can be served by CQRS projections without Event Sourcing.

## Decision

We will not apply Event Sourcing to the `PolicyRenewalAggregate`. State will be persisted as current state in a relational table. Domain events will still be raised and published to the outbox for downstream integration, but the aggregate's storage is state-based, not event-based.

## Consequences

**Positive:**
- Simpler persistence model — no event store infrastructure required
- Faster onboarding for team members unfamiliar with Event Sourcing
- No upcasting or event schema versioning complexity for this feature

**Negative / trade-offs:**
- Historical policy states are not queryable from `PolicyContext` — must query `AuditContext` for historical snapshots
- If a temporal query requirement emerges in a future milestone, migrating to Event Sourcing will be a significant refactor

**Neutral:**
- Domain events are still raised and published — integration with downstream contexts is unaffected

## Alternatives Rejected

| Alternative | Reason rejected |
|---|---|
| Apply Event Sourcing to PolicyRenewalAggregate | No story requires temporal queries or history-based invariants; the audit trail is handled by a dedicated context; over-engineering for current scope |
| Hybrid: event-sourced for audit events only | Mixing state-based and event-based storage in the same aggregate adds complexity without benefit |
```

---

## Filled Example 3: Bounded Context Split — Eligibility vs Policy

```markdown
# ADR-003: Separate EligibilityContext from PolicyContext

**Status:** Accepted
**Date:** 2026-05-03

## Context

The eligibility check and the policy issuance share the concept of a `Driver`. However:

- In `EligibilityContext`, a `Driver` is a person seeking entitlement to insurance coverage. The relevant data is accident history, licence validity, and risk score.
- In `PolicyContext`, a `Driver` is an insured party named on a policy. The relevant data is policyholder details, coverage selections, and payment schedule.

These two meanings of `Driver` have diverging language, diverging data models, and are owned by different teams (actuarial team owns eligibility; operations team owns policy issuance). Merging them into one context would create a model that serves neither well and would couple the two teams' delivery timelines.

## Decision

We will maintain `EligibilityContext` and `PolicyContext` as separate bounded contexts. `EligibilityContext` publishes the `EligibilityChecked` domain event via an Open Host Service. `PolicyContext` consumes this event via an Anti-Corruption Layer that translates the eligibility result into `PolicyContext`'s own domain language.

## Consequences

**Positive:**
- Each context evolves its `Driver` model independently
- Teams can deploy independently
- The Open Host Service creates a stable integration contract between contexts

**Negative / trade-offs:**
- Two `Driver` representations to maintain (one per context)
- The ACL in `PolicyContext` must be updated if the `EligibilityChecked` event schema changes
- Slightly higher initial complexity than a single shared model

**Neutral:**
- Event schema versioning governance is required for the Published Language

## Alternatives Rejected

| Alternative | Reason rejected |
|---|---|
| Shared `Driver` model across both contexts | Language conflict — `Driver` means different things; merging would pollute both models |
| Shared Kernel for `Driver` | High coordination overhead; the two teams have different release cadences; a shared kernel change blocks both |
| `PolicyContext` conforming to `EligibilityContext` driver model | PolicyContext's `Driver` has policy-specific data (payment, coverage) that has no place in an eligibility model |
```
