# ADR Template

## Overview

This file provides the blank ADR template for direct copy-paste, the file naming rules, the row of the decision index, the ADR Quality Checklist and filled examples from the auto-insurance (MonAssurance) domain. Every ADR opens with the YAML header of the Blank Template below: the engine refuses an ADR whose header has no `decision:` key, however its body states the decision.

---

## Blank Template

```markdown
---
adr: {NNN}                    # int, matches filename
title: {Short Title}
status: Proposed             # Proposed | Accepted | Rejected | Deprecated | Superseded
chosen: {picked option}      # one token/phrase — the option adopted
decision: >                  # ONE sentence: the verdict in plain words
  {We will ... / We will not adopt ... because ...}
supersedes: {ADR-MMM | null}
date: {YYYY-MM-DD}
ratified_by: null            # "{human} {YYYY-MM-DD}" — set ONLY on Accept/Reject
---

# ADR-{NNN}: {Short Title}

**Status:** Proposed | Accepted | Rejected | Deprecated | Superseded by ADR-{NNN}
**Date:** {YYYY-MM-DD}

## Context

{Describe the situation and forces that led to this decision. What problem were you solving? What constraints were in play? What quality attributes or business requirements created the tension?}

**Decision drivers, ranked:** 1. {the force, quality attribute or constraint that matters most} 2. {…}

## Decision

{State the decision clearly and directly. One paragraph. Start with "We will..." or "We have decided to...". Do not explain why here — that belongs in Context and Alternatives Rejected. Name technologies or families, never a version.}

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
| {option B} | {specific reason, naming the driver it loses on — not a strawman} |

## Confirmation

{The architecture test, rule or fitness check that fails when the code departs from this decision, in any stack. None possible: "None possible, because …".}
```

---

## File Naming

`adr-{NNN}-{slug}.md`

Examples:
- `adr-001-cqrs-bus-eligibility.md`
- `adr-002-aggregate-boundary-eligibility.md`
- `adr-003-event-sourcing-eligibility.md` *(slug names the topic; verdict lives in the `Status:` field — `Accepted` or `Rejected`)*

Rules:
- Numbers are three digits, zero-padded: `001`, not `1`
- Slugs are lowercase kebab-case, derived from the short title
- **Slugs name the SUBJECT, never the verdict.** Forbidden suffixes: `-rejected`, `-accepted`, `-deprecated`, `-superseded`. The verdict lives in `Status:`.
- Gaps in numbering are forbidden — never skip a number
- Numbers are never reused — a deprecated ADR keeps its number

---

## Decision index row — `docs/adr/decisions-index.md`

```markdown
<!-- markdownlint-disable-file -->
# ADR decision index (append-only digest)

| ADR | Title | Status | Chosen | Decision (1 line) | Ratified by | Date |
|---|---|---|---|---|---|---|
| 001 | CQRS dispatch bus | Accepted | CQRS+Bus | Introduce ICommandBus/IQueryBus pipeline over unchanged CQS | alice 2026-05-01 | 2026-05-01 |
| 007 | Event Sourcing for Policy | Proposed | Event Sourcing | Store Policy as events to answer the premium on any past date | — | 2026-06-23 |
```

---

## ADR Quality Checklist

Before writing the final ADR, verify:

- [ ] **Single decision** — the ADR captures exactly one choice, not a bundle of decisions
- [ ] **Clear decision statement** — starts with "We will…" or "We have decided to…"; no ambiguity
- [ ] **Context explains the why** — the forces that made this decision necessary are described
- [ ] **Consequences include negatives** — no decision is trade-off-free; if you can't name a downside, keep thinking
- [ ] **Alternatives are genuine** — rejected alternatives are real options that were seriously considered, not strawmen
- [ ] **Alternatives explain the rejection** — not "too complex" but "too complex because X and Y are not needed given the current story set", against the ranked drivers
- [ ] **Confirmation** — the check that fails when the code departs from the decision, or why none is possible
- [ ] **Status is set** — `Proposed` when drafting, `Accepted` when ratified
- [ ] **Supersession is linked** — if this supersedes another ADR, both are updated: the old one's status, the new one's `Supersedes:` line
- [ ] **Decision level** — Context, a one-sentence decision, Consequences, Alternatives on about one page; signatures, route trees, enum values and Value Object inventories go in the DESIGN details.
- [ ] **Autonomous** — the ADR records one technical decision and reads on its own. No code reference: no `#file:<path>[:start[-end]]` citation, no file path, no `path:line`. No user story, acceptance criterion identifier, ticket or issue number, not even the story that raised it: that link lives in `docs/adr/decisions-index.md`. No other ADR: the only `ADR-NNN` it names is its own and the one it replaces, on its `Supersedes:` or `Amends:` line.
- [ ] **No version** — name technologies or families ("Red Hat UBI base images", "a client-side router"), never a version, image tag, digest or package version; when a version matters, state the capability it brings. Versions live in manifests (`.csproj`, `package.json`, Dockerfile `ARG`, CI).

---

## Filled Example 1: CQRS for Eligibility Check

```markdown
---
adr: 1
title: Apply CQRS for Eligibility Check
status: Accepted
chosen: simple CQRS
decision: >
  We will separate the eligibility check's command handlers from its query handlers, both over the same relational database.
supersedes: null
date: 2026-05-01
ratified_by: "Claire Martin 2026-05-03"
---

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

## Confirmation

An architecture test fails when a query handler depends on the eligibility aggregate, or a command handler returns a read model.
```

---

## Filled Example 2: Event Sourcing Rejected for Policy Renewal

```markdown
---
adr: 2
title: Reject Event Sourcing for Policy Renewal
status: Accepted
chosen: state-based persistence
decision: >
  We will not apply Event Sourcing to the PolicyRenewalAggregate, which is persisted as its current state.
supersedes: null
date: 2026-05-02
ratified_by: "Claire Martin 2026-05-04"
---

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

## Confirmation

An architecture test fails when a type of `PolicyContext` depends on an event store.
```

---

## Filled Example 3: CQRS Dispatch Bus over a CQS Baseline

> **Note on baseline vs decision.** CQS at method level (one `ICommandHandler<>` per command, one `IQueryHandler<,>` per query, no method that both mutates and returns a domain value) is the project's clean-architecture baseline — enforced by the `clean-architecture-*` skill and by NetArchTest rules. It is **not** an ADR topic. What follows is an ADR for **CQRS+Bus**: the introduction of dispatch bus interfaces (`ICommandBus`, `IQueryBus`) and a pipeline through which every handler is invoked. Adopting a bus is a structural commitment with cross-cutting consequences (DI registration strategy, pipeline behaviors, testing surface) — that is what makes it ADR-worthy.

```markdown
---
adr: 1
title: Introduce a CQRS Dispatch Bus for Application Handlers
status: Accepted
chosen: CQRS+Bus
decision: >
  We will introduce a command bus and a query bus in the Application layer, through which the API layer invokes every handler.
supersedes: null
date: 2026-05-01
ratified_by: "alice 2026-05-01"
---

# ADR-001: Introduce a CQRS Dispatch Bus for Application Handlers

**Status:** Accepted
**Date:** 2026-05-01

## Context

The project's baseline is CQS at the method level: every use case is implemented as either an `ICommandHandler<TCommand>` or an `IQueryHandler<TQuery, TResult>`, registered by convention. Today, the API layer injects each handler directly through the DI container.

Three cross-cutting concerns have appeared on multiple handlers and are starting to be copied by hand: input validation, structured logging around every dispatch, and a unit-of-work boundary around command execution. Implementing each of these as a per-handler decorator wired manually in DI does not scale: the registration code becomes a `switch` over handler types and new behaviors require touching every registration site.

A dispatch bus (`ICommandBus` / `IQueryBus`) lets us wrap handler invocation in an ordered pipeline of behaviors registered once. The handler implementations themselves remain unchanged — the bus is a structural addition over an unchanged CQS surface.

**Decision drivers, ranked:** 1. one place per cross-cutting behaviour 2. handlers and their registration unchanged 3. a direct call path

## Decision

We will introduce a command bus and a query bus in the Application layer; the API layer injects them instead of individual handlers, and every dispatch runs through one ordered pipeline of behaviours (validation, logging, a unit of work around commands). Handler interfaces and their convention-based registration do not change.

## Consequences

**Positive:**
- Cross-cutting behaviors live in one place per behavior, not duplicated across handlers
- API layer depends on two stable interfaces instead of N handler interfaces
- New cross-cutting concerns are added by registering a behavior, not by editing every handler or every DI registration

**Negative / trade-offs:**
- One extra indirection between caller and handler — stack traces and `Find Usages` are slightly less direct
- Pipeline order becomes part of the architecture and must be documented; reordering behaviors is a real change
- Test setup for code that calls the bus must either stub the bus or run the full pipeline

**Neutral:**
- The CQS baseline is unchanged — every existing handler keeps its interface and is reachable directly for unit tests
- No message broker, queue, or out-of-process dispatch is introduced — this remains in-process

## Alternatives Rejected

| Alternative | Reason rejected |
|---|---|
| Keep direct handler injection, no bus (the baseline before this ADR) | Cross-cutting concerns force per-handler decorators registered by hand; the DI module becomes a `switch` over handler types and every new behavior touches every registration site |
| Add the behaviors as plain decorators registered per handler in DI, without a bus | Equivalent runtime semantics, but the registration code grows as O(handlers × behaviors) instead of O(behaviors); pipeline order is implicit in registration order across N call sites |
| Use a third-party mediator library | Adds an external dependency for a thin abstraction this project can own in ~50 lines; the library's full surface (notifications, request/response, streams) is wider than needed |
| Full CQRS with separate read/write data stores | Out of scope of this ADR — that decision concerns the data tier, not the dispatch tier, and would warrant its own ADR if the read load required it |

## Confirmation

An architecture test fails when a type of the API layer depends on a handler interface rather than on the command bus or the query bus.
```

---

No example covers a bounded-context split or an Anti-Corruption Layer: the contexts and their relationships go to `docs/architecture/context-map.md`, a translation inside one context to its tactical design, never to an ADR.
