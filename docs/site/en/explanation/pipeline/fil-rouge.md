---
layout: doc
lang: en
title: "The running example — a Starbucks order end to end"
description: "Follow one request through optional product preflight and then the SKRAFT engineering pipeline."
persona: tech-lead
---

# The running example — a Starbucks order end to end

> One request, followed from idea to delivered code, to see how each phase hands the baton to the next.

This page is a **narrative**: it does not describe SKRAFT in the abstract, it walks
you through **one concrete example** from end to end. The thread is the *artifact
flow* — each phase's output becomes the next phase's input.

> ☕ **Illustrative example.** The Starbucks case below is invented for teaching.
> It is not derived from the plugin's code; no figure in it is real.

## What you will follow

The request: **"let a customer order and pay for a customised drink from the
mobile app, to pick it up in store."**

You will see this request turn, phase by phase, into tested code.

```mermaid
graph LR
    A[Idea] -->|triage report| B[INVEST story]
    B -->|sourced research| R[Recommendation]
    R -->|ADR + events| C[Architecture]
    C -->|Gherkin scenarios| D[Specification]
    D -->|code + evidence| E[Delivered code]
    style A fill:#102016,stroke:#6f8478
    style B fill:#1a3a2a,stroke:#4ed58a
    style C fill:#1a3a2a,stroke:#4ed58a
    style D fill:#1a3a2a,stroke:#4ed58a
    style E fill:#1a3a2a,stroke:#4ed58a
```

## Optional product preflight

DISCOVER then DISCUSS are standalone and outside the orchestrator. They run in
this order when the request does not already arrive refined.

### Step 1 — DISCOVER: triage the idea

The idea arrives as a **raw issue** in the backlog. The `backlog-discoverer`
triages it: it assigns priority **P1**, detects it overlaps an older "in-app
payment" request, and records it in a **triage report**.

- **What enters:** "enable mobile ordering in the app".
- **What exits:** a prioritised line in the triage report.

➡️ Phase detail: [DISCOVER]({{ "/en/explanation/pipeline/discover" | relative_url }}).

### Step 2 — DISCUSS: turn it into a story

The `backlog-planner` receives the report and turns the prioritised line into an
**INVEST story**:

> As a customer, I order a customised drink to pick up in store, so that I save
> time on arrival.

With its **acceptance criteria**:

1. The customer chooses size and milk type before paying.
2. Payment is required before the order goes to preparation.
3. An unavailable drink cannot be added to the cart.

- **What enters:** the triage line.
- **What exits:** the story + its 3 criteria.

➡️ Phase detail: [DISCUSS]({{ "/en/explanation/pipeline/discuss" | relative_url }}).

## Orchestrated engineering pipeline

### Step 3 — RESEARCH: gather evidence

The `solution-researcher` analyses the story, existing code, and conventions. It
compares payment options and recommends a sourced approach without writing code
or deciding the ADR.

- **What enters:** the story and its criteria.
- **What exits:** the cited research document and its handoff to DESIGN.

➡️ Phase detail: [RESEARCH]({{ "/en/explanation/pipeline/research" | relative_url }}).

### Step 4 — DESIGN: decide the architecture

The `solution-architect` designs the solution. It records an **ADR**:

> **Decision:** delegate payment to an external provider via an anti-corruption
> layer (ACL), so the ordering domain is not coupled to the provider.

And an **event model**:

```
PlaceOrder → OrderPaid → OrderReady
```

- **What enters:** the story, its criteria, and the research document.
- **What exits:** the ADR + the event model + the contracts.

➡️ Phase detail: [DESIGN]({{ "/en/explanation/pipeline/design" | relative_url }}).

### Step 5 — DISTILL: write the executable contract

The `acceptance-designer` translates the architecture into a **Gherkin
scenario**, readable by the business:

```gherkin
Scenario: pay for a customised drink
  Given a cart containing a medium latte with oat milk
  When payment is approved
  Then a receipt is issued
  And loyalty points are credited to the customer
```

- **What enters:** the ADR + the event model.
- **What exits:** the `.feature` + the implementation plan.

➡️ Phase detail: [DISTILL]({{ "/en/explanation/pipeline/distill" | relative_url }}).

### Step 6 — DELIVER: implement, guided by tests

The `software-engineer` makes the scenario green with **Outside-In TDD**. It
first writes the acceptance test (red), then the unit tests for the total
calculation and loyalty crediting, and finally the code (green). A **mutation
score** verifies the tests genuinely protect the loyalty rule.

- **What enters:** the Gherkin scenario + the plan.
- **What exits:** tested code + quality evidence, ready for the Pull Request.

➡️ Phase detail: [DELIVER]({{ "/en/explanation/pipeline/deliver" | relative_url }}).

## What you have just seen

One request crossed two optional product workflows, then the engineering
pipeline, without losing its context:

| Phase | Artifact produced |
| --- | --- |
| DISCOVER | Prioritised line in the triage report |
| DISCUSS | INVEST story + 3 acceptance criteria |
| RESEARCH | Cited research document + recommendation |
| DESIGN | ADR (payment via ACL) + event model |
| DISTILL | Gherkin scenario + implementation plan |
| DELIVER | Tested code + mutation score |

Each artifact became the **context** of the next step. Declared reviewers then
apply the [gates]({{ "/en/reference/gates" | relative_url }}).

## Going further

- [Pipeline overview]({{ "/en/explanation/pipeline/" | relative_url }})
- [The detail of the gates crossed]({{ "/en/reference/gates" | relative_url }})
- [The HVE-Core substrate]({{ "/en/explanation/hve-core" | relative_url }})
