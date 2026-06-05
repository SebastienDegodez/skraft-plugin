---
layout: doc
lang: fr
title: "DESIGN"
persona: software-engineer
---

# DESIGN

{% include phase-ribbon.html current="design" %}

La phase DESIGN traduit les stories affinées en décisions d'architecture explicites et traçables.

## Ce qui entre, ce qui sort

| | |
|---|---|
| **Vient de** | **DISCUSS** — la story INVEST + ses critères |
| **Ce qui entre** | Story affinée à concevoir |
| **Ce qui sort** | ADR + diagramme de composants + modèle d'événements |
| **Va vers** | **DISTILL** — qui en dérive les scénarios exécutables |
| **Agent responsable** | `solution-architect` |
| **Reviewer associé** | `solution-architect-reviewer` |

## Pourquoi cette phase existe

Sans décisions d'architecture explicites, chaque développeur invente sa propre structure. Le solution-architect utilise Event Modeling et DDD pour modéliser les Bounded Context, les Aggregate et les Domain Event. Le reviewer vérifie la cohérence et la fitness des patterns choisis.

> « The model is the backbone of a language used by all team members to describe the system. »
> — Evans, E., *Domain-Driven Design*, 2003.

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Fil rouge — Starbucks <em>(exemple illustratif)</em></span>

La story de commande entre. DESIGN produit un **ADR** « déléguer le paiement à un fournisseur externe via une couche anti-corruption (ACL) » et un **modèle d'événements** `PasserCommande` → `CommandePayée` → `CommandePrête`. Ce modèle alimente DISTILL.
</div>

## Ce que produit l'agent

- Architecture Decision Records (ADR) avec contexte, décision et conséquences.
- Diagramme de composants avec frontières de Bounded Context.
- Event Model montrant le flux Command → Event → Read Model.
- Contrats d'interface entre composants.

## Les gates franchies ici

Cette phase franchit les gates **G1–G15** (voir le [catalogue des gates](../catalogue/gates.html)).
Chaque gate est vérifiée par le reviewer indépendant avant le passage à **DISTILL**.
