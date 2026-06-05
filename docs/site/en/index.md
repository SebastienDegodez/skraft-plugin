---
layout: doc
lang: en
title: "SKRAFT — The Handbook"
persona: tech-lead
---

# SKRAFT — The Handbook

SKRAFT is an **AI-agent-driven SDLC pipeline**. Each development phase is executed
by a dedicated agent, then validated by an independent reviewer — no agent
validates its own work.

> « The only way to go fast is to go well. »
> — Martin, R. C., *Clean Architecture*, 2017.

## First time here? Follow the running example

The fastest way to understand SKRAFT is to follow **one single example** from
idea to delivered code:

➡️ **[The running example: a Starbucks order end to end]({{ "/en/pipeline/fil-rouge" | relative_url }})**

Then install the plugin and run the pipeline: [Getting started]({{ "/en/getting-started" | relative_url }}).

## How to read this handbook

The documentation follows the **Diátaxis** structure — four doors depending on
what you are trying to do:

| Door | For… | Start with |
| --- | --- | --- |
| **Learn** | following a guided path | [The running example]({{ "/en/pipeline/fil-rouge" | relative_url }}), [Getting started]({{ "/en/getting-started" | relative_url }}) |
| **Understand** | knowing *why* it is built this way | [The pipeline]({{ "/en/pipeline/" | relative_url }}), [Review before review]({{ "/en/why-review-before-review" | relative_url }}) |
| **Look up** | finding a precise fact | [Agents]({{ "/en/reference/agents/" | relative_url }}), [Gates]({{ "/en/catalogue/gates" | relative_url }}), [Patterns]({{ "/en/catalogue/patterns" | relative_url }}) |
| **Go deeper** | digging into an approach | [Outside-In TDD]({{ "/en/deep-dive/outside-in-tdd" | relative_url }}), [Walking Skeleton]({{ "/en/deep-dive/walking-skeleton" | relative_url }}) |

## Where to go by role

- **Executive** — why assisted review lowers time-to-delivery: [For executives]({{ "/en/for-executives" | relative_url }}).
- **Developer** — the pipeline phase by phase and the agent team: [The pipeline]({{ "/en/pipeline/" | relative_url }}), [The team]({{ "/en/pipeline/team" | relative_url }}).
- **Architect** — decisions and boundaries: [Architecture]({{ "/en/architecture" | relative_url }}), [Clean Architecture]({{ "/en/clean-architecture" | relative_url }}).
- **Coming from HVE?** — the continuity (RPI, `state.json`, BRD/PRD upstream): [HVE → SKRAFT]({{ "/en/hve-vs-skraft" | relative_url }}).

## The pipeline in one picture

```mermaid
graph LR
    D[DISCOVER] -->|triage| DI[DISCUSS]
    DI -->|story| DE[DESIGN]
    DE -->|architecture| DIS[DISTILL]
    DIS -->|scenarios| DEL[DELIVER]
    DEL -->|code| PR[Pull Request]
    style D fill:#1a3a2a,stroke:#4ed58a
    style DI fill:#1a3a2a,stroke:#4ed58a
    style DE fill:#1a3a2a,stroke:#4ed58a
    style DIS fill:#1a3a2a,stroke:#4ed58a
    style DEL fill:#1a3a2a,stroke:#4ed58a
    style PR fill:#102016,stroke:#6f8478
```

Five phases, one agent and one reviewer per phase, on the shared
[HVE-Core]({{ "/en/hve-core" | relative_url }}) substrate.
