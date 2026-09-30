---
layout: doc
lang: en
title: "DESIGN"
persona: software-engineer
---

# DESIGN

{% include phase-ribbon.html current="design" %}

The DESIGN phase translates refined stories into explicit, traceable architecture decisions.

## What enters, what exits

| | |
|---|---|
| **Comes from** | **DISCUSS** — the INVEST story + its criteria |
| **What enters** | Refined story, RESEARCH brief and structural scan |
| **What exits** | ADR + component diagram + event model |
| **Goes to** | **DISTILL** — which derives the executable scenarios |
| **Responsible agent** | `solution-architect` |
| **Associated reviewer** | `solution-architect-reviewer` |

## Why this phase exists

Without explicit architecture decisions, every developer invents their own structure. The solution-architect uses Event Modeling and DDD to model Bounded Contexts, Aggregates, and Domain Events. The reviewer verifies consistency and fitness of the chosen patterns.

> « The model is the backbone of a language used by all team members to describe the system. »
> — Evans, E., *Domain-Driven Design*, 2003.

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Running example — Starbucks <em>(illustrative)</em></span>

The ordering story enters. DESIGN produces an **ADR** “delegate payment to an external provider via an anti-corruption layer (ACL)” and an **event model** `PlaceOrder` → `OrderPaid` → `OrderReady`. This model feeds DISTILL.
</div>

## What the agent produces

- Architecture Decision Records (ADR) with context, decision, and consequences.
- Component diagram with Bounded Context boundaries.
- Event Model showing the Command → Event → Read Model flow.
- Interface contracts between components.
- Consistency matrix tying ADR decisions back to diagrams, contracts and event models.

## How upstream evidence is reused

The solution architect receives the research document as a required input and the
`details/{date}/structural-scan.json` report as context. Phase 3 is **REUSE
VERIFICATION**: it classifies existing aggregates, contexts, use cases and patterns from
those two sources first, and searches code only for questions they leave open. The scan
is run once by the orchestrator before the first DESIGN dispatch; it detects CQRS bus,
Event Sourcing and Saga signatures, while cross-context ACL stays a manual review point.

The reviewer runs before human ADR ratification. Gates that require an `Accepted` ADR
accept a current-pass `Proposed` ADR; gates that forbid an `Accepted` ADR also forbid a
current-pass `Proposed` one. The reviewer reads `docs/adr/decisions-index.md` first,
opens only ADR bodies needed for the pass under review, and re-runs the structural scan
for G1. Interface contracts pass G4 when they live in Domain or Application, matching the
layer the ADR records, never in Infrastructure.

## Gates crossed here

This phase crosses gates **G1–G16** (see the [gates catalogue]({{ "/en/reference/gates" | relative_url }})).
Each gate is checked by the independent reviewer before moving on to **DISTILL**.
