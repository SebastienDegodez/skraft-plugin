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
| **Ce qui entre** | Story affinée, brief RESEARCH et scan structurel |
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
- Matrice de cohérence reliant les décisions ADR aux diagrammes, contrats et modèles d'événements.

## Comment les preuves amont sont réutilisées

Le solution architect reçoit le document de recherche comme entrée obligatoire et le
rapport `details/{date}/structural-scan.json` comme contexte. La phase 3 est **REUSE
VERIFICATION** : elle classe les agrégats, contextes, cas d'usage et patterns existants à
partir de ces deux sources d'abord, puis ne cherche dans le code que les questions qu'elles
laissent ouvertes. Le scan est lancé une seule fois par l'orchestrateur avant le premier
dispatch DESIGN ; il détecte les signatures bus CQRS, Event Sourcing et Saga, tandis que
l'ACL inter-contexte reste un point de revue manuelle.

Le reviewer intervient avant la ratification humaine des ADR. Les gates qui exigent un
ADR `Accepted` acceptent un ADR `Proposed` du passage en revue ; les gates qui interdisent
un ADR `Accepted` interdisent aussi un `Proposed` de ce passage. Le reviewer lit d'abord
`docs/adr/decisions-index.md`, n'ouvre que les corps d'ADR nécessaires au passage revu,
et relance le scan structurel pour G1. Les contrats d'interface passent G4 quand ils vivent
dans Domain ou Application, selon la couche enregistrée par l'ADR, jamais dans Infrastructure.

## Les gates franchies ici

Cette phase franchit les gates **G1–G16** (voir le [catalogue des gates]({{ "/fr/reference/gates" | relative_url }})).
Chaque gate est vérifiée par le reviewer indépendant avant le passage à **DISTILL**.
