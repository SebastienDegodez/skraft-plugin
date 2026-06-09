---
layout: doc
lang: en
title: "Architecture"
persona: tech-lead
---

# Architecture

SKRAFT applies the CQS (Command-Query Separation) principle at the system level. The orchestrator dispatches commands to executor agents, who produce artifacts. Reviewer agents read those artifacts and emit verdicts — they never modify anything.

> « Asking a question should not change the answer. »
> — Meyer, B., *Object-Oriented Software Construction, 2nd ed.*, 1997.

## Overview

```mermaid
graph TB
    O[skraft-orchestrator] -->|dispatch| BD[backlog-discoverer]
    O -->|dispatch| BP[backlog-planner]
    O -->|dispatch| SA[solution-architect]
    O -->|dispatch| AD[acceptance-designer]
    O -->|dispatch| SE[software-engineer]
    
    BD -->|writes| A1[triage report]
    BP -->|writes| A2[refined stories]
    SA -->|writes| A3[ADRs + diagrams]
    AD -->|writes| A4[Gherkin scenarios]
    SE -->|writes| A5[tested code]

    SE -.fan-out.-> MIW[mock-integration-worker]
    SE -.fan-out.-> CTW[contract-testing-worker]
    MIW -->|test wiring| A5
    CTW -->|test wiring| A5
    MIW -.if active.-> MFL[mock-fidelity-lens]
    CTW -.if active.-> CFL[contract-fidelity-lens]
    MFL -->|verdict| SER
    CFL -->|verdict| SER
    
    A1 -.->|reads| BDR[backlog-discoverer-reviewer]
    A2 -.->|reads| BPR[backlog-planner-reviewer]
    A3 -.->|reads| SAR[solution-architect-reviewer]
    A4 -.->|reads| ADR[acceptance-designer-reviewer]
    A5 -.->|reads| SER[software-engineer-reviewer]
    
    BDR -->|verdict| O
    BPR -->|verdict| O
    SAR -->|verdict| O
    ADR -->|verdict| O
    SER -->|verdict| O
    
    O -.->|reads| S[(state.json)]
    
    style O fill:#2d5a3d,stroke:#4ed58a,stroke-width:2px
    style S fill:#1a2a3a,stroke:#7fd3ff
    style MIW fill:#243a2e,stroke:#4ed58a
    style CTW fill:#243a2e,stroke:#4ed58a
    style MFL fill:#3a2e1a,stroke:#d5a84e
    style CFL fill:#3a2e1a,stroke:#d5a84e
```

## Legend

| Arrow | Meaning |
|-------|---------|
| **Solid** orchestrator → executor | Command (CQS command side) |
| **Solid** executor → artifact | Write — the executor produces an artifact |
| **Dashed** artifact → reviewer | Read-only (CQS query side) |
| **Solid** reviewer → orchestrator | Verdict (PASS / FAIL + reasons) |
| **Dashed** orchestrator → state.json | CQRS read model |
| **Dashed** `software-engineer` → worker | DELIVER internal fan-out (`user-invocable: false` subagents) |
| **Dashed** worker → fidelity lens | The lens joins the panel when the capability is active |

## The DELIVER internal fan-out

In DELIVER, the `software-engineer` does not wire the tests by hand: it **delegates**
the wiring to internal subagents (`mock-integration-worker` for mocking the
downstream dependency, `contract-testing-worker` for the provider-side contract
test). Each worker emits test wiring only; the business TDD cycle stays with the
lead, who verifies the worker in TIER-1 (RED → GREEN). When a capability is active,
its **fidelity lens** (`mock-fidelity-lens` / `contract-fidelity-lens`) joins the
adversarial panel of the `software-engineer-reviewer`. See the
[agents reference]({{ "/en/reference/agents/" | relative_url }}).

## Strict separation

Executors **write** artifacts but never emit verdicts on their own work. Reviewers **read** artifacts and produce verdicts, but never modify code or documents. This separation guarantees that every artifact is validated by an independent eye.

The `state.json` file serves as the read model (CQRS): the orchestrator records phase progression and verdicts there, then consults it to decide the next action.

See [Core concepts]({{ "/en/explanation/concepts" | relative_url }}) for the theory behind CQS and CQRS.
