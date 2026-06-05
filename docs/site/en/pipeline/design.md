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
| **What enters** | Refined story to design |
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

## Gates crossed here

This phase crosses gates **G1–G15** (see the [gates catalogue](../catalogue/gates.html)).
Each gate is checked by the independent reviewer before moving on to **DISTILL**.
