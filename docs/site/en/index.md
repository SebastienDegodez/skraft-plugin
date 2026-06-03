---
layout: default
lang: en
title: "SKRAFT in 15 minutes"
persona: tech-lead
---

# SKRAFT in 15 minutes

SKRAFT is an AI-agent-driven SDLC pipeline. Each development phase is executed by a dedicated agent, then validated by an independent reviewer — no agent verifies its own work.

> « Programs must be written for people to read, and only incidentally for machines to execute. »
> — Abelson, H. & Sussman, G. J., *Structure and Interpretation of Computer Programs*, 1985.

This page is a **guided handbook**: it walks the pipeline phase by phase, explains what each agent and skill contributes, then links out to the detailed pages for going deeper.

## The guided flow: DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER

{% include mermaid.html code="graph LR
    D[DISCOVER] --> DI[DISCUSS]
    DI --> DE[DESIGN]
    DE --> DIS[DISTILL]
    DIS --> DEL[DELIVER]
    style D fill:#1a3a2a,stroke:#4ed58a
    style DI fill:#1a3a2a,stroke:#4ed58a
    style DE fill:#1a3a2a,stroke:#4ed58a
    style DIS fill:#1a3a2a,stroke:#4ed58a
    style DEL fill:#1a3a2a,stroke:#4ed58a" %}

The five phases chain together to process exactly one Use Case per cycle — no batching, no shortcuts.

## The 5 phases: agents, skills and expected outcomes

### 1. DISCOVER

- **Agent** — `backlog-discoverer` triages and prioritises issues.
- **Skills involved** — difficulty routing and backlog triage.
- **Expected outcome** — an actionable triage report that opens the cycle.

[DISCOVER phase detail](/en/pipeline/discover)

### 2. DISCUSS

- **Agent** — `backlog-planner` refines stories against INVEST criteria.
- **Skills involved** — issue refinement and acceptance-criteria authoring.
- **Expected outcome** — ready stories with explicit acceptance criteria.

[DISCUSS phase detail](/en/pipeline/discuss)

### 3. DESIGN

- **Agent** — `solution-architect` models architecture via Event Modeling, DDD and ADRs.
- **Skills involved** — architecture patterns, architecture decisions (ADRs) and review criteria.
- **Expected outcome** — an architecture model with traced decisions.

[DESIGN phase detail](/en/pipeline/design)

### 4. DISTILL

- **Agent** — `acceptance-designer` translates architecture decisions into executable Gherkin scenarios.
- **Skills involved** — acceptance design and test-design mandates.
- **Expected outcome** — executable acceptance scenarios.

[DISTILL phase detail](/en/pipeline/distill)

### 5. DELIVER

- **Agent** — `software-engineer` implements code via Outside-In TDD.
- **Skills involved** — outside-in TDD, craft discipline and clean-architecture testing, with Mutation Score as the quality gate.
- **Expected outcome** — delivered code, covered and verified.

[DELIVER phase detail](/en/pipeline/deliver)

## Clean Architecture positioning

SKRAFT applies the CQS (Command-Query Separation) principle at the system level: executor agents command (they write artefacts), reviewer agents query (they read without modifying). That separation of responsibilities is Clean Architecture expressed at the scale of the pipeline.

> « The only way to go fast is to go well. »
> — Martin, R. C., *Clean Architecture*, 2017.

[See the pipeline architecture](/en/architecture)

## Object Calisthenics: why the discipline

In the DELIVER phase, the `software-engineer` applies craft discipline (including Object Calisthenics) to constrain the shape of the code: small units, strong encapsulation, explicit intent. The goal is not aesthetics but **verifiability**: disciplined code is simpler to review and to mutate.

[See the core concepts](/en/concepts)

## Decision traceability (ADRs)

Every significant architecture decision is recorded in an ADR (Architecture Decision Record) during the DESIGN phase. ADRs make choices **auditable**: a reviewer can recover the rationale behind a decision, and a new maintainer can understand the history without re-reading all the code.

[See Architecture](/en/architecture) · [See Concepts](/en/concepts)

## Where to go next

- **Executives** — Read [For executives](/en/for-executives) to understand the ROI.
- **Developers** — Explore [the pipeline in detail](/en/pipeline/) phase by phase.
- **Architecture** — Understand [the architecture](/en/architecture) and the [concepts](/en/concepts).
- **Reference** — Browse the [agents reference](/en/reference/agents/) and the [skills reference](/en/reference/skills/).
- **Ready to go** — Follow the [Getting Started](/en/getting-started) guide.
