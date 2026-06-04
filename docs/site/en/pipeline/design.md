---
layout: doc
lang: en
title: "DESIGN"
persona: software-engineer
---

# DESIGN

The DESIGN phase translates refined stories into explicit, traceable architecture decisions.

## Mechanics

| | |
|---|---|
| **Entry trigger** | Refined story (output of DISCUSS) |
| **Output artefact** | ADR + component diagram + Event Model |
| **Responsible agent** | `solution-architect` |
| **Associated reviewer** | `solution-architect-reviewer` |

## Why this phase exists

Without explicit architecture decisions, every developer invents their own structure. The solution-architect uses Event Modeling and DDD to model Bounded Contexts, Aggregates, and Domain Events. The reviewer verifies consistency and fitness of the chosen patterns.

> « The model is the backbone of a language used by all team members to describe the system. »
> — Evans, E., *Domain-Driven Design*, 2003.

## What the agent produces

- Architecture Decision Records (ADR) with context, decision, and consequences.
- Component diagram with Bounded Context boundaries.
- Event Model showing the Command → Event → Read Model flow.
- Interface contracts between components.

## Gates crossed here

This phase crosses gates **G1–G15** (see the [gates catalogue](../catalogue/gates.html)).
Each gate is checked by the independent reviewer before moving on to **DISTILL**.
