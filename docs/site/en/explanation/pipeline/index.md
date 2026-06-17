---
layout: doc
lang: en
title: "The SKRAFT pipeline"
persona: tech-lead
---

# The SKRAFT pipeline

SKRAFT orchestrates five sequential phases. Each phase is executed by a specialised agent and validated by an independent reviewer. The orchestrator (`skraft-orchestrator`) sequences transitions and enforces invariants.

The thread running through the pipeline is the **artifact flow**: each phase's output becomes the next phase's input. The arrows below carry the artifact being handed over.

```mermaid
graph LR
    D[DISCOVER] -->|triage report| DI[DISCUSS]
    DI -->|INVEST story| DE[DESIGN]
    DE -->|ADR + event model| DIS[DISTILL]
    DIS -->|Gherkin scenarios| DEL[DELIVER]
    DEL -->|code + evidence| PR[Pull Request]
    style D fill:#1a3a2a,stroke:#4ed58a
    style DI fill:#1a3a2a,stroke:#4ed58a
    style DE fill:#1a3a2a,stroke:#4ed58a
    style DIS fill:#1a3a2a,stroke:#4ed58a
    style DEL fill:#1a3a2a,stroke:#4ed58a
    style PR fill:#102016,stroke:#6f8478
```

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Running example — Starbucks <em>(illustrative)</em></span>

To see this flow in action, follow one request — “order and pay for a drink in the Starbucks app” — from idea to code, phase by phase: [Follow an end-to-end example]({{ "/en/explanation/pipeline/fil-rouge" | relative_url }}).
</div>

## Phases

### [DISCOVER]({{ "/en/explanation/pipeline/discover" | relative_url }})

Triage and prioritise issues to produce an actionable triage report.

### [DISCUSS]({{ "/en/explanation/pipeline/discuss" | relative_url }})

Refine stories against INVEST criteria and produce verifiable acceptance criteria.

### [DESIGN]({{ "/en/explanation/pipeline/design" | relative_url }})

Model architecture via Event Modeling, DDD, and Architecture Decision Records.

### [DISTILL]({{ "/en/explanation/pipeline/distill" | relative_url }})

Translate architecture decisions into executable Gherkin scenarios and an implementation plan.

### [DELIVER]({{ "/en/explanation/pipeline/deliver" | relative_url }})

Implement code via Outside-In TDD with Mutation Score as a quality gate.

---

The orchestrator coordinates everything: it verifies pre-conditions for each phase, triggers reviewers, and only allows transitions when the verdict is positive.
