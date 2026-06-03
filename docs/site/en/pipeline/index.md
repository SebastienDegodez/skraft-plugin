---
layout: doc
lang: en
title: "The SKRAFT pipeline"
persona: tech-lead
---

# The SKRAFT pipeline

SKRAFT orchestrates five sequential phases. Each phase is executed by a specialised agent and validated by an independent reviewer. The orchestrator (`skraft-orchestrator`) sequences transitions and enforces invariants.

```mermaid
graph LR
    D[DISCOVER] --> DI[DISCUSS]
    DI --> DE[DESIGN]
    DE --> DIS[DISTILL]
    DIS --> DEL[DELIVER]
    style D fill:#1a3a2a,stroke:#4ed58a
    style DI fill:#1a3a2a,stroke:#4ed58a
    style DE fill:#1a3a2a,stroke:#4ed58a
    style DIS fill:#1a3a2a,stroke:#4ed58a
    style DEL fill:#1a3a2a,stroke:#4ed58a
```

## Phases

### [DISCOVER](/en/pipeline/discover)

Triage and prioritise issues to produce an actionable triage report.

### [DISCUSS](/en/pipeline/discuss)

Refine stories against INVEST criteria and produce verifiable acceptance criteria.

### [DESIGN](/en/pipeline/design)

Model architecture via Event Modeling, DDD, and Architecture Decision Records.

### [DISTILL](/en/pipeline/distill)

Translate architecture decisions into executable Gherkin scenarios and an implementation plan.

### [DELIVER](/en/pipeline/deliver)

Implement code via Outside-In TDD with Mutation Score as a quality gate.

---

The orchestrator coordinates everything: it verifies pre-conditions for each phase, triggers reviewers, and only allows transitions when the verdict is positive.
