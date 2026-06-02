---
layout: default
lang: fr
title: "DISCUSS"
persona: software-engineer
---

# DISCUSS

La phase DISCUSS affine les issues triées en stories structurées, prêtes à être conçues.

## Mécanique

| | |
|---|---|
| **Trigger d'entrée** | Issue triée (sortie de DISCOVER) |
| **Artefact de sortie** | Story affinée avec critères d'acceptation (INVEST) |
| **Agent responsable** | `backlog-planner` |
| **Reviewer associé** | `backlog-planner-reviewer` |

## Pourquoi cette phase existe

Une story mal définie produit du code qui résout le mauvais problème. Le backlog-planner applique les critères INVEST et le reviewer vérifie que les critères d'acceptation sont vérifiables et complets.

> « In software development, there are always four variables: cost, time, quality, and scope. »
> — Beck, K., *Extreme Programming Explained, 2nd ed.*, 2004.

## Ce que produit l'agent

- Story au format User Story avec persona, action et bénéfice.
- Critères d'acceptation en langage naturel structuré.
- Estimation d'effort affinée.
- Identification des dépendances entre stories.
