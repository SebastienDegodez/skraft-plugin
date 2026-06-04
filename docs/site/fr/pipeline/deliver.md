---
layout: doc
lang: fr
title: "DELIVER"
persona: software-engineer
---

# DELIVER

La phase DELIVER implémente le code fonctionnel, guidé par les tests, avec une qualité vérifiée empiriquement.

## Mécanique

| | |
|---|---|
| **Trigger d'entrée** | Scénarios BDD (sortie de DISTILL) |
| **Artefact de sortie** | Code fonctionnel (Outside-In TDD, mutation testé) |
| **Agent responsable** | `software-engineer` |
| **Reviewer associé** | `software-engineer-reviewer` |

## Pourquoi cette phase existe

Le code est le seul artefact qui compte en production. Le software-engineer applique l'Outside-In TDD : les Acceptance Test guident les tests unitaires, qui guident l'implémentation. Le Mutation Score vérifie que les tests protègent réellement le comportement. Le reviewer est read-only — il ne modifie jamais le code.

> « We grow working software, guided by tests, from the outside in. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

## Ce que produit l'agent

- Code implémenté selon le cycle RED → GREEN → REFACTOR.
- Tests d'acceptation passants liés aux scénarios Gherkin.
- Tests unitaires couvrant les invariants du Domain.
- Mutation Score comme preuve empirique de la qualité des tests.

## Les gates franchies ici

Cette phase franchit les gates de livraison — tests RED/GREEN intègres, build vert,
score de mutation au seuil (voir le [catalogue des gates](../catalogue/gates.html)).
Le reviewer indépendant émet son verdict avant l'ouverture de la **PR**.
