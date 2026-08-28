---
layout: doc
lang: en
title: "The team — the pipeline as a relay race"
description: "The six executor agents, five reviewers, and skraft-orchestrator: who does what, and where the human chooses the next handoff."
persona: tech-lead
---

# The team — the pipeline as a relay race

> Six executors and five reviewers, split between two standalone product roots and one engineering orchestrator.

SKRAFT is not a monolithic agent. DISCOVER and DISCUSS are two product workflows
selected directly by the developer. `skraft-orchestrator` then takes a refined
story and sequences engineering agents. No global orchestrator drives all six
steps.

## The relay at a glance

```mermaid
graph LR
    H((human)) --> D[backlog-discoverer]
    D -->|triage| H
    H --> DI[backlog-planner]
    DI -->|refined story| H
    H --> O[skraft-orchestrator]
    O -->|when needed| R[solution-researcher]
    R -->|research| DE[solution-architect]
    O -.sequences.-> DE
    DE -->|architecture| DIS[acceptance-designer]
    DIS -->|scenarios| DEL[software-engineer]
    style H fill:#102016,stroke:#6f8478
    style O fill:#102016,stroke:#6f8478
    style D fill:#1a3a2a,stroke:#4ed58a
    style DI fill:#1a3a2a,stroke:#4ed58a
    style DE fill:#1a3a2a,stroke:#4ed58a
    style DIS fill:#1a3a2a,stroke:#4ed58a
    style DEL fill:#1a3a2a,stroke:#4ed58a
```

## The orchestrator — `skraft-orchestrator`

The engineering conductor only. It produces no business artifact: it
**sequences** RESEARCH → DESIGN → DISTILL → DELIVER, checks pre-conditions,
invokes declared reviewers, and applies their verdicts. It invokes neither
`backlog-discoverer` nor `backlog-planner`. It owns the `state.json` (see
[the HVE-Core substrate]({{ "/en/explanation/hve-core" | relative_url }})).

## The two standalone product roots

### 1. `backlog-discoverer` — the triager (DISCOVER)

- **Mission:** turn a raw stream of issues into a prioritised triage report.
- **Receives:** issues, a milestone.
- **Hands off:** a triage report.
- **Checked by:** `backlog-discoverer-reviewer` (gates G1–G6).
- **Invoked by:** the developer, outside `skraft-orchestrator`.

### 2. `backlog-planner` — the refiner (DISCUSS)

- **Mission:** turn a triaged issue into an INVEST story with acceptance criteria.
- **Receives:** the triage report.
- **Hands off:** a ready, unambiguous story.
- **Checked by:** `backlog-planner-reviewer` (gates G1–G8).
- **Invoked by:** the developer, outside `skraft-orchestrator`.

## The four engineering executors

### 3. `solution-researcher` — the researcher (RESEARCH)

- **Mission:** reduce unknowns through sourced investigation when difficulty justifies it.
- **Receives:** the refined story and repository context.
- **Hands off:** a sourced recommendation.
- **Checked by:** no declared phase reviewer. `skraft-orchestrator` verifies the output contract before closing the phase.

### 4. `solution-architect` — the architect (DESIGN)

- **Mission:** model the architecture (Event Modeling, DDD) and trace decisions in ADRs.
- **Receives:** the INVEST story.
- **Hands off:** an ADR + an event model + contracts.
- **Checked by:** `solution-architect-reviewer` (gates G1–G15).

### 5. `acceptance-designer` — the specifier (DISTILL)

- **Mission:** translate the architecture into executable Gherkin scenarios.
- **Receives:** the ADR and the event model.
- **Hands off:** `.feature` files + an implementation plan.
- **Checked by:** `acceptance-designer-reviewer` (gates G1–G8).

### 6. `software-engineer` — the craftsperson (DELIVER)

- **Mission:** implement the code with Outside-In TDD, proven by the mutation score.
- **Receives:** the Gherkin scenarios.
- **Hands off:** tested code + quality evidence, to the Pull Request.
- **Checked by:** `software-engineer-reviewer` (delivery gates).
- **Delegates internally:** test wiring to two subagents (`user-invocable: false`) — `mock-integration-worker` (mocking the downstream dependency) and `contract-testing-worker` (provider-side contract test). The software-engineer keeps the business TDD cycle and verifies each worker in TIER-1 (RED → GREEN). When a capability is active, its fidelity lens (`mock-fidelity-lens` / `contract-fidelity-lens`) joins the reviewer's panel.

## Why five reviewers for six executors

> « Peer reviews are the single most effective quality practice a software organization can employ. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

DISCOVER, DISCUSS, DESIGN, DISTILL, and DELIVER each have a dedicated reviewer
that never modifies the judged work. RESEARCH is the exception: no phase reviewer
is declared, so the orchestrator closes it after checking its output contract. No
one validates their own artifact in the five reviewed loops.

## Going further

- [The running example: a Starbucks order end to end]({{ "/en/explanation/pipeline/fil-rouge" | relative_url }})
- [The agent catalogue]({{ "/en/dashboard/" | relative_url }})
- [The detail of the gates]({{ "/en/reference/gates" | relative_url }})
- [Review before review]({{ "/en/explanation/why-review-before-review" | relative_url }})
