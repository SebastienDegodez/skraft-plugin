---
layout: default
lang: fr
title: "DESIGN"
persona: software-engineer
---

# DESIGN

La phase DESIGN traduit les stories affinées en décisions d'architecture explicites et traçables.

## Mécanique

| | |
|---|---|
| **Trigger d'entrée** | Story affinée (sortie de DISCUSS) |
| **Artefact de sortie** | ADR + diagramme de composants + Event Model |
| **Agent responsable** | `solution-architect` |
| **Reviewer associé** | `solution-architect-reviewer` |

## Pourquoi cette phase existe

Sans décisions d'architecture explicites, chaque développeur invente sa propre structure. Le solution-architect utilise Event Modeling et DDD pour modéliser les Bounded Context, les Aggregate et les Domain Event. Le reviewer vérifie la cohérence et la fitness des patterns choisis.

> « The model is the backbone of a language used by all team members to describe the system. »
> — Evans, E., *Domain-Driven Design*, 2003.

## Ce que produit l'agent

- Architecture Decision Records (ADR) avec contexte, décision et conséquences.
- Diagramme de composants avec frontières de Bounded Context.
- Event Model montrant le flux Command → Event → Read Model.
- Contrats d'interface entre composants.
