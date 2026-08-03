---
layout: doc
lang: fr
title: "DELIVER"
persona: software-engineer
---

# DELIVER

{% include phase-ribbon.html current="deliver" %}

La phase DELIVER implémente le code fonctionnel, guidé par les tests, avec une qualité vérifiée empiriquement.

## Ce qui entre, ce qui sort

| | |
|---|---|
| **Vient de** | **DISTILL** — les scénarios Gherkin + le plan |
| **Ce qui entre** | Spécifications exécutables à implémenter |
| **Ce qui sort** | Code testé + évidence qualité (mutation, RED→GREEN) |
| **Va vers** | La **Pull Request** — revue humaine puis livraison |
| **Agent responsable** | `software-engineer` |
| **Reviewer associé** | `software-engineer-reviewer` |

## Pourquoi cette phase existe

Le code est le seul artefact qui compte en production. Le software-engineer applique l'Outside-In TDD : les Acceptance Test guident les tests unitaires, qui guident l'implémentation. Le Mutation Score vérifie que les tests protègent réellement le comportement. Le reviewer est read-only — il ne modifie jamais le code.

> « We grow working software, guided by tests, from the outside in. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Fil rouge — Starbucks <em>(exemple illustratif)</em></span>

Le scénario entre. DELIVER implémente le calcul du total et l'attribution des points en cycles **RED → GREEN**, puis un **score de mutation** atteste que les tests protègent réellement la règle de fidélité. Le code part en Pull Request.
</div>

## Ce que produit l'agent

- Une **liste de tests ordonnée** (TPP + FLFI), écrite avant tout code de production :
  chaque test planifié porte sa sémantique BDD, sa transformation TPP et la contradiction
  logique qui le justifie (voir [ordered-test-list]({{ "/fr/reference/skills/ordered-test-list" | relative_url }})).
- Code implémenté selon le cycle RED → GREEN → REFACTOR, une entrée de la liste à la fois.
- Tests d'acceptation passants liés aux scénarios Gherkin.
- Tests unitaires couvrant les invariants du Domain.
- Mutation Score comme preuve empirique de la qualité des tests.

## Le fan-out interne : câblage des tests

Le `software-engineer` ne câble pas les tests d'intégration à la main : il **délègue**
ce wiring à des sous-agents internes (`user-invocable: false`), un par capacité.

| Capacité | Worker | Stratégie | Lentille de fidélité |
| --- | --- | --- | --- |
| Mocking (consommateur) | `mock-integration-worker` | Microcks par défaut, surchargeable in-process | `mock-fidelity-lens` |
| Contrat (fournisseur) | `contract-testing-worker` | intégration in-process + Microcks en opt-in | `contract-fidelity-lens` |

Chaque worker n'émet que du câblage de test — le cycle TDD métier reste chez le lead,
qui vérifie le worker en **TIER-1** (le test échoue d'abord, puis passe). Quand une
capacité est active, sa lentille de fidélité rejoint le panel adverse du
`software-engineer-reviewer`. Le câblage concret est résolu par stack via un *roster*
(voir les [skills]({{ "/fr/reference/skills/" | relative_url }})).

## Les gates franchies ici

Cette phase franchit les gates de livraison — tests RED/GREEN intègres, build vert,
score de mutation au seuil (voir le [catalogue des gates]({{ "/fr/reference/gates" | relative_url }})).
Le reviewer indépendant émet son verdict avant l'ouverture de la **PR**.
