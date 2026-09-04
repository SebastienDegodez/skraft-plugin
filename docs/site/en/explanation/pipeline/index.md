---
layout: doc
lang: en
title: "The SKRAFT pipeline"
persona: tech-lead
---

# The SKRAFT pipeline

SKRAFT does not force one global chain on every project. It offers two top-level
journeys: the core journey turns a story into code, while the Brownfield journey
helps take over an existing system.

## Choose your journey

| Observed situation | Entrypoint | Expected output |
| --- | --- | --- |
| A refined story exists | `skraft-orchestrator` | reviewed engineering PR |
| The backlog exists but needs triage or refinement | `backlog-discoverer`, then `backlog-planner` | refined story for `skraft-orchestrator` |
| Code exists without explicit product intent | `brownfield-analyst` | PRD, then issues to prepare before `skraft-orchestrator` |
| Legacy code must be secured or transformed | `brownfield-harness-builder`, then `brownfield-refactorer` | protected or refactored code, ready for future stories |

The [Brownfield journey]({{ "/en/explanation/brownfield" | relative_url }}) is a
sibling journey, not a preliminary pipeline phase. Its three roots are invoked
directly by the human and do not write `skraft-orchestrator` state.

## The core journey

The core journey separates product preparation from engineering.
`backlog-discoverer` then `backlog-planner` are optional standalone workflows.
When both are used, their order is mandatory. They hand a refined story to
`skraft-orchestrator`, entrypoint for the engineering pipeline.

The thread running through the pipeline is the **artifact flow**: each phase's output becomes the next phase's input. The arrows below carry the artifact being handed over.

```mermaid
graph LR
    D[optional DISCOVER] -.->|triage report| DI[optional DISCUSS]
    DI -.->|INVEST story| R[RESEARCH]
    R -->|sourced research| DE[DESIGN]
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

## Optional product preflight

### [DISCOVER]({{ "/en/explanation/pipeline/discover" | relative_url }})

Triage and prioritise issues to produce an actionable triage report.

### [DISCUSS]({{ "/en/explanation/pipeline/discuss" | relative_url }})

Refine stories against INVEST criteria and produce verifiable acceptance criteria.

## Orchestrated engineering pipeline

### [RESEARCH]({{ "/en/explanation/pipeline/research" | relative_url }})

Investigate the story and relevant sources to produce a sourced recommendation
before any architecture decision.

### [DESIGN]({{ "/en/explanation/pipeline/design" | relative_url }})

Model architecture via Event Modeling, DDD, and Architecture Decision Records.

### [DISTILL]({{ "/en/explanation/pipeline/distill" | relative_url }})

Translate architecture decisions into executable Gherkin scenarios and an implementation plan.

### [DELIVER]({{ "/en/explanation/pipeline/deliver" | relative_url }})

Implement code via Outside-In TDD with Mutation Score as a quality gate.

---

The orchestrator coordinates RESEARCH → DESIGN → DISTILL → DELIVER. It verifies
pre-conditions, invokes declared reviewers, and applies their verdicts.
When routing concludes that a dedicated investigation would add no value,
RESEARCH may be skipped. Every phase that runs remains subject to its contract
and expected evidence.
