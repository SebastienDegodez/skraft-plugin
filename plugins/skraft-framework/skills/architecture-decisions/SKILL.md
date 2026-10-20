---
name: architecture-decisions
description: Use when deciding whether a candidate architectural choice deserves an ADR ("should I write an ADR for X?", "how many ADRs does this story need?", "too many ADRs", baseline versus decision), when documenting a decision as an ADR, evaluating trade-offs between alternatives, or managing the lifecycle of existing decisions. Covers the eligibility gate, ADR template, status transitions, consequence analysis, and quality criteria. Not for choosing which pattern to adopt (architecture-patterns).
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

**These two rules apply only to ADRs already on the default branch.** An ADR the default branch does not hold yet (check: `git cat-file -e <base>:docs/adr/<file>`) is a draft of the pull request: edit its content, header and index row in place, and set its status back to `Proposed` so the human ratifies it again. Never supersede or amend an unpublished ADR, and never give it `amended_by`, `amended_in_place`, `superseded_by` or a history section; git keeps the drafts.

### Human-in-the-loop ratification

The `Proposed → Accepted | Rejected` transition is owned by a human, not the agent. The ratification channel is supplied by the execution context (the skraft engine's question in a pipeline run, an in-terminal prompt in a local run).

**Both transitions are committed:** the `Proposed` revision AND the final `Accepted` / `Rejected` revision land in git history. The trail of "we paused here for a human" is part of the architectural record.

### Rejected ADRs

A `Rejected` ADR documents that an option was seriously evaluated and the team decided NOT to adopt it. The ADR exists so the same debate is not re-opened in six months without new evidence.

- **Filename:** named after the SUBJECT — `adr-NNN-event-sourcing.md`, NEVER `adr-NNN-event-sourcing-rejected.md`. The verdict lives in `Status:`, not in the filename.
- **Decision phrasing:** MAY start with "We will not adopt X because…" — this is precisely what a `Rejected` status means.
- **Trigger requirement:** a `Rejected` ADR is written ONLY when a story or measurable force in the current batch raised the question (Eligibility Gate, Q4). A `Rejected` ADR with no triggering story is a non-decision artefact and is forbidden.
- **Alternatives Rejected section** is flipped: list what the team adopted INSTEAD (e.g., "state-based persistence with audit-log table").

---

## Decision Digest — cheap-to-read verdict surface

The full ADR body is the *rationale*. No reader (the ratification question, the reviewer, DISTILL, the next-pass blocker re-grounding) should re-read a whole ADR body just to learn its **verdict**. The digest is the stable, cheap-to-read surface that carries only the verdict-bearing fields. It exists in two mirrored forms.

### Per-ADR decision header

Every ADR file begins with the YAML frontmatter shown in the Blank Template above, **before** the `# ADR-{NNN}` title. A reader reads ONLY this frontmatter (the first ~10 lines) to obtain `status`, `chosen`, and the one-line `decision`. Load the prose body solely when the *rationale* is needed (e.g. re-evaluating a supersession). Keep the header free of dynamic noise — no timestamps beyond `date`, no per-run paths — so it stays a stable prefix.

### Project-global decision index — `docs/adr/decisions-index.md`

An append-only registry, sibling of `docs/adr/supersessions.md`. One row per ADR aggregates the header fields. One read of this file yields every decision in the project without opening a single ADR body.

```markdown
<!-- markdownlint-disable-file -->
# ADR decision index (append-only digest)

| ADR | Title | Status | Chosen | Decision (1 line) | Ratified by | Date |
|---|---|---|---|---|---|---|
| 001 | CQRS dispatch bus | Accepted | CQRS+Bus | Introduce ICommandBus/IQueryBus pipeline over unchanged CQS | alice 2026-05-01 | 2026-05-01 |
| 007 | Conformist Eligibility->Policy | Proposed | Conformist | Eligibility conforms to RiskProfile VO; ACL dropped | — | 2026-06-23 |
```

Write rule: when an ADR is first committed (`Status: Proposed`), append its row with `Ratified by: —`. On the ratification status flip, update **only** the `Status` and `Ratified by` cells of that row in place — once the ADR is on the default branch, the row is never removed and never reordered (numbering stays monotonic, matching the supersession-registry doctrine); before that, edit the row in place with its ADR.

### Reading the digest cheaply

Read the verdict, never the body. Prefer, in order:

1. **Whole project at once** — read `docs/adr/decisions-index.md` (one small file = every decision).
2. **One ADR's verdict** — search `docs/adr/decisions-index.md` for the line starting with `| 007 `.
3. **One ADR's header** — read only the first ~12 lines of the ADR file: the YAML frontmatter ends at the second `---`, so `status`, `chosen` and `decision` are there.

---

## Ratification Contract (single source of the human gate)

This is the canonical definition of the `Proposed -> Accepted | Rejected` gate.

1. **Agent drafts, human decides.** The agent commits every story-triggered ADR with `Status: Proposed` and appends its digest row. The agent NEVER self-ratifies — it cannot set `Accepted` / `Rejected` on its own authority.
2. **Gate fires after quality review, not before.** Ratification is requested only once the DESIGN reviewer has APPROVED the artefacts. Asking a human to ratify a draft that may fail adversarial review wastes their attention and trains rubber-stamping.
3. **The gate is a hard pre-condition for the next phase.** No downstream phase (DISTILL) may begin while any ADR in the current pass is still `Proposed`. Advancing without the verdict is a post-hoc checkpoint — the decision would already be in effect before the human chose.
4. **The verdict surface is the digest.** The gate presents the decision index / headers (the one-line decisions), NOT the full ADR bodies. The human may open a body on demand via the link.
5. **Both revisions land in git.** The `Proposed` commit AND the final `Accepted` / `Rejected` commit are both committed — the trail of "we paused for a human here" is part of the architectural record. On the flip, set `ratified_by` in the header and update the index row.
6. **Channel is supplied by the execution context.** In the skraft pipeline the engine asks the human after DESIGN and, on ratification, sets `Accepted`, `ratified_by` and the index row itself and commits them; the agent never writes these. In a standalone local run, prompt the developer in-terminal. This skill prescribes the contract, not the transport.

---

## Eligibility Gate — before drafting any ADR

Run the gate on every candidate choice before writing an ADR body. Answer the questions in order; the first one that settles the verdict ends the gate.

ADRs record **additions** and **deviations** from the project baseline. The baseline itself — the conventions enforced by project skills and architecture tests — is never an ADR.

### Q1 — Is the choice already enforced by a project skill or an automated architecture test?

Baseline examples: pure domain service with no IO (Clean Architecture layering, `clean-architecture-*` skill and architecture tests); CQS at method level, one handler per command or query; validation at the boundary with a pure core; convention-based DI registration; Value Object with a pure validator (tactical DDD).

YES → `NOT ELIGIBLE — <skill, test or ADR that already enforces it>`.

### Q2 — Is the choice framed as a good practice or as avoiding an antipattern?

Examples: "no hardcoded phase names", "don't duplicate validation logic", "avoid magic strings".

YES → `NOT ELIGIBLE — baseline good practice / antipattern avoidance`. Exception: a choice reframed as a context-mapping relationship ("config as Published Language, guard as Conformist") goes on to Q3.

### Q3 — Does the choice add complexity beyond the baseline?

It does when it:
- establishes or changes a layer boundary
- chooses an aggregate boundary
- **adopts** a pattern that adds complexity: CQRS+Bus, Event Sourcing, Saga, Specification, ACL, Published Language, Conformist
- establishes a bounded context boundary or chooses a context-mapping relationship
- affects a cross-cutting concern (error handling strategy, validation approach)

NO → `NOT ELIGIBLE — no complexity addition beyond baseline`. Implementation details (naming, formatting), configuration choices (connection string format, environment variable names) and library versions without architectural impact land here; switching EF Core to Dapper does not, it changes the data access strategy.

### Q4 — Did a story, an AC or a measurable force in the current batch raise the question?

Silence = baseline default. An AC requires evaluating the choice, the event model surfaced it as a decision point, or a technical constraint (performance, security, integration) forced it.

NO → `NOT ELIGIBLE — unraised question; non-decision artefact (G14)`. A `Rejected` ADR follows the same rule.

### Q5 — Does the choice have genuine trade-offs?

Score it against the 5 Universal Forces (Trade-off Framework below).

High on all five → `NOT ELIGIBLE — no genuine trade-offs; should be baseline`. Tension between at least two forces → `ELIGIBLE — genuine trade-off`.

### Gate output

One block per candidate:

```
Candidate: Fail-closed posture for dispatch gate
Verdict: ELIGIBLE
Reason: Q1 NO, Q2 NO, Q3 YES (cross-cutting error strategy), Q4 YES (AC-04), Q5 YES (over-blocking vs silent drift)

Candidate: VO + validation at boundary
Verdict: NOT ELIGIBLE
Reason: Q1 YES — Clean Architecture layering + tactical DDD enforce this

Candidate: No hardcoded phase names
Verdict: NOT ELIGIBLE (as framed)
Reason: Q2 YES — "no hardcoding" is a good practice, not a decision
```

Write an ADR only for an `ELIGIBLE` candidate. Gate failures map to review findings: ADR-INFLATION (Q1), GOOD-PRACTICE ADR (Q2), BASELINE DRIFT (Q1 + Q3), UNRAISED QUESTION (Q4), NON-DECISION (Q5).

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
