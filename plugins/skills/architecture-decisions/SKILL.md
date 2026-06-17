---
name: architecture-decisions
description: Use when documenting architecture decisions as ADRs, evaluating trade-offs between alternatives, or managing the lifecycle of existing decisions. Covers ADR template, status transitions, consequence analysis, and quality criteria.
---

# Architecture Decisions

## Overview

Architecture Decision Records (ADRs) are lightweight documents that capture architectural decisions together with their context, alternatives considered, and consequences. They are the institutional memory of the architecture.

**Purpose:** An ADR answers the question: "Why does the architecture look the way it does?" Future readers — including future you — should be able to understand any structural decision without needing to ask the original author.

**Core rule:** One ADR per decision. A decision is a single, clear choice with trade-offs.

---

## ADR Template

### Blank Template

```markdown
# ADR-{NNN}: {Short Title}

**Status:** Proposed | Accepted | Rejected | Deprecated | Superseded by ADR-{NNN}
**Date:** {YYYY-MM-DD}

## Context

{Describe the situation and the forces that led to this decision. What problem were you solving? What constraints were in play? Why was a decision needed at all?}

## Decision

{State the decision clearly and directly. Start with "We will..." or "We have decided to...". One paragraph, maximum. Avoid explaining why here — that belongs in Context and Alternatives.}

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
| {option A} | {why not chosen — specific, not a strawman} |
| {option B} | {why not chosen — specific, not a strawman} |
```

### Filled Example — Auto Insurance Domain

> **Note on baseline vs decision.** CQS at method level (one `ICommandHandler<>` per command, one `IQueryHandler<,>` per query, no method that both mutates and returns a domain value) is the project's clean-architecture baseline — enforced by the `clean-architecture-*` skill and by NetArchTest rules. It is **not** an ADR topic. What follows is an ADR for **CQRS+Bus**: the introduction of dispatch bus interfaces (`ICommandBus`, `IQueryBus`) and a pipeline through which every handler is invoked. Adopting a bus is a structural commitment with cross-cutting consequences (DI registration strategy, pipeline behaviors, testing surface) — that is what makes it ADR-worthy.

```markdown
# ADR-001: Introduce a CQRS Dispatch Bus for Application Handlers

**Status:** Accepted
**Date:** 2026-05-01

## Context

The project's baseline is CQS at the method level: every use case is implemented as either an `ICommandHandler<TCommand>` or an `IQueryHandler<TQuery, TResult>`, registered by convention. Today, the API layer injects each handler directly through the DI container.

Three cross-cutting concerns have appeared on multiple handlers and are starting to be copied by hand: input validation, structured logging around every dispatch, and a unit-of-work boundary around command execution. Implementing each of these as a per-handler decorator wired manually in DI does not scale: the registration code becomes a `switch` over handler types and new behaviors require touching every registration site.

A dispatch bus (`ICommandBus` / `IQueryBus`) lets us wrap handler invocation in an ordered pipeline of behaviors registered once. The handler implementations themselves remain unchanged — the bus is a structural addition over an unchanged CQS surface.

## Decision

We will introduce `ICommandBus.DispatchAsync(ICommand)` and `IQueryBus.DispatchAsync<TResult>(IQuery<TResult>)` in the Application layer. The API layer will inject these two buses instead of individual handlers. The bus implementation lives in Infrastructure and resolves the matching handler from the container, then invokes it through an ordered pipeline of behaviors:

1. `ValidationBehavior` — runs FluentValidation against the message; failures short-circuit the pipeline.
2. `LoggingBehavior` — structured log around dispatch (message type, duration, outcome).
3. `UnitOfWorkBehavior` (commands only) — opens a UoW before the handler, commits on success, rolls back on exception.

Handler interfaces and signatures do not change. Convention-based handler registration does not change.

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

## Status and Lifecycle

```
Proposed → Accepted   → Deprecated
        ↘ Rejected    → Superseded by ADR-{NNN}
```

- **Proposed:** Decision is drafted, committed, and awaiting human ratification
- **Accepted:** Option was evaluated and adopted — the architecture reflects it
- **Rejected:** Option was evaluated and explicitly declined — the ADR records the analysis so the debate is not re-run later without new evidence
- **Deprecated:** Decision is no longer relevant (e.g., the feature was removed), but was never superseded
- **Superseded:** Decision has been replaced by a newer one — always reference the successor

**Linking rule:** When ADR-002 supersedes ADR-001:
- ADR-001 status: `Superseded by ADR-002`
- ADR-002 context: reference ADR-001 — "This supersedes ADR-001, which prescribed X."

**No ADR is ever deleted.** The historical record of why a decision was made is as valuable as the decision itself.

### Human-in-the-loop ratification

The `Proposed → Accepted | Rejected` transition is owned by a human, not the agent. The ratification channel is supplied by the execution context (the orchestrating workflow when running in an agentic pipeline, or an in-terminal prompt when running locally) — this skill does not prescribe the channel.

**Both transitions are committed:** the `Proposed` revision AND the final `Accepted` / `Rejected` revision land in git history. The trail of "we paused here for a human" is part of the architectural record.

### Rejected ADRs

A `Rejected` ADR documents that an option was seriously evaluated and the team decided NOT to adopt it. The ADR exists so the same debate is not re-opened in six months without new evidence.

- **Filename:** named after the SUBJECT — `adr-NNN-event-sourcing.md`, NEVER `adr-NNN-event-sourcing-rejected.md`. The verdict lives in `Status:`, not in the filename.
- **Decision phrasing:** MAY start with "We will not adopt X because…" — this is precisely what a `Rejected` status means.
- **Trigger requirement:** a `Rejected` ADR is written ONLY when a story or measurable force in the current batch raised the question (see G9 traceability). A `Rejected` ADR with no triggering story is a non-decision artefact and is forbidden.
- **Alternatives Rejected section** is flipped: list what the team adopted INSTEAD (e.g., "state-based persistence with audit-log table").

---

## When to Write an ADR

Write an ADR for any decision that:
- Establishes or changes a layer boundary
- Chooses an aggregate boundary
- **Adopts** a pattern that adds complexity beyond the project baseline (CQRS+Bus, Event Sourcing, Saga, Specification, ACL)
- Establishes a bounded context boundary
- Chooses a context mapping relationship (ACL, Conformist, etc.)
- Affects a cross-cutting concern (error handling strategy, validation approach)

ADRs are written for **additions** and **deviations** from the project baseline. The baseline itself is not an ADR — it is the set of conventions enforced by project skills and architecture tests.

### When NOT to Write an ADR

Do not write an ADR for:
- Implementation details (naming conventions, code formatting)
- Library version choices — unless the version has architectural impact (e.g., switching from EF Core to Dapper changes the data access strategy)
- Configuration choices (connection string format, environment variable names)
- **A pattern that was never raised by any story or measurable force.** Silence = baseline default. ADRs (whether `Accepted` or `Rejected`) ratify questions that were actually asked. A `Rejected` ADR is legitimate ONLY when a story or measurable force in the batch raised the question — in which case the ADR records the evaluation so the debate is not re-opened without new evidence. Writing a `Rejected` ADR for an unraised question is a non-decision artefact (G14).
- **A convention already enforced by a project skill or by automated architecture tests** (e.g., CQS method-level separation, layer boundaries, convention-based DI registration). Conventions are baseline; ADRs document additions or deviations from baseline.

---

## Trade-off Framework

Every ADR must demonstrate genuine trade-off analysis — not a decision with only upsides.

### The 5 Universal Forces

| Force | Question |
|---|---|
| **Simplicity** | Does this make the system easier to understand and change? |
| **Consistency** | Does this fit the patterns already established in this codebase? |
| **Performance** | Does this meet the performance requirements without over-engineering? |
| **Evolvability** | Does this make future changes easier or harder? |
| **Team capability** | Can the current team maintain this without a steep learning curve? |

### Trade-off Analysis Template

```
| Force | Option A | Option B | Weight |
|---|---|---|---|
| Simplicity | High | Low | High |
| Consistency | High | Medium | Medium |
| Performance | Medium | High | Low |
| Evolvability | High | High | High |
| Team capability | High | Low | High |
| → Score | 4.2 | 2.8 | |
```

Use this table in the Context section when the decision is genuinely hard. Skip it for obvious decisions.

---

## ADR Quality Checklist

Before writing the final ADR, verify:

- [ ] **Single decision** — the ADR captures exactly one choice, not a bundle of decisions
- [ ] **Clear decision statement** — starts with "We will…" or "We have decided to…"; no ambiguity
- [ ] **Context explains the why** — the forces that made this decision necessary are described
- [ ] **Consequences include negatives** — no decision is trade-off-free; if you can't name a downside, keep thinking
- [ ] **Alternatives are genuine** — rejected alternatives are real options that were seriously considered, not strawmen
- [ ] **Alternatives explain the rejection** — not "too complex" but "too complex because X and Y are not needed given the current story set"
- [ ] **Status is set** — `Proposed` when drafting, `Accepted` when ratified
- [ ] **Supersession is linked** — if this supersedes another ADR, both are updated

---

## References

- [adr-template.md](references/adr-template.md) — Blank template + filled auto-insurance example
- [decision-drivers.md](references/decision-drivers.md) — Trade-off analysis framework and decision scenarios
