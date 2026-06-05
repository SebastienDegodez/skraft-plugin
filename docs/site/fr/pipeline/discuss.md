---
layout: doc
lang: fr
title: "DISCUSS"
persona: software-engineer
---

# DISCUSS

{% include phase-ribbon.html current="discuss" %}

La phase DISCUSS affine les issues triées en stories structurées, prêtes à être conçues.

## Ce qui entre, ce qui sort

| | |
|---|---|
| **Vient de** | **DISCOVER** — le rapport de triage priorisé |
| **Ce qui entre** | Issue triée à raffiner |
| **Ce qui sort** | Story INVEST + critères d'acceptation vérifiables |
| **Va vers** | **DESIGN** — qui en conçoit l'architecture |
| **Agent responsable** | `backlog-planner` |
| **Reviewer associé** | `backlog-planner-reviewer` |

## Pourquoi cette phase existe

Une story mal définie produit du code qui résout le mauvais problème. Le backlog-planner applique les critères INVEST et le reviewer vérifie que les critères d'acceptation sont vérifiables et complets.

> « In software development, there are always four variables: cost, time, quality, and scope. »
> — Beck, K., *Extreme Programming Explained, 2nd ed.*, 2004.

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Fil rouge — Starbucks <em>(exemple illustratif)</em></span>

Le rapport de triage entre. DISCUSS en tire la **story INVEST** : « En tant que client, je commande une boisson personnalisée pour la récupérer en magasin. » Elle sort accompagnée de **3 critères d'acceptation** (choix de la taille, du lait, et paiement avant préparation). DESIGN recevra cette story.
</div>

## Ce que produit l'agent

- Story au format User Story avec persona, action et bénéfice.
- Critères d'acceptation en langage naturel structuré.
- Estimation d'effort affinée.
- Identification des dépendances entre stories.

## Les gates franchies ici

Cette phase franchit les gates **G1–G8** (voir le [catalogue des gates](../catalogue/gates.html)).
Chaque gate est vérifiée par le reviewer indépendant avant le passage à **DESIGN**.
