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

- Code implémenté selon le cycle RED → GREEN → REFACTOR.
- Tests d'acceptation passants liés aux scénarios Gherkin.
- Tests unitaires couvrant les invariants du Domain.
- Mutation Score comme preuve empirique de la qualité des tests.

## Workers d'infrastructure de tests (fan-out B1)

Quand une tranche nécessite de l'**infrastructure de test** plutôt que de la logique métier,
le `software-engineer` délègue à un worker interne, vérifie son résultat, puis intègre les
fichiers émis dans son propre cycle TDD et commite. Le worker ne commite jamais.

| Besoin | Worker dispatché | Ce que le worker émet |
|--------|------------------|-----------------------|
| Mocker une dépendance downstream appelée par le SUT (côté consommateur) | `mock-integration-worker` | câblage mock + scaffold d'integration-test |
| Test de contrat provider pour l'API de CE service | `contract-testing-worker` | test baseline WAF+HttpClient (+ couche Microcks `TestEndpointAsync` en opt-in) |

Le `software-engineer` exécute ensuite lui-même le cycle RED → GREEN sur les fichiers
du worker (règle : un seul auteur de commits, `TIER-1 verify`).
Le `software-engineer-reviewer` active des **lentilles conditionnelles** en miroir :
`mock-fidelity-lens` si le diff touche un mock downstream,
`contract-fidelity-lens` si le diff touche un contrat ou un test provider.

## Les gates franchies ici

Cette phase franchit les gates de livraison — tests RED/GREEN intègres, build vert,
score de mutation au seuil (voir le [catalogue des gates]({{ "/fr/reference/gates" | relative_url }})).
Le reviewer indépendant émet son verdict avant l'ouverture de la **PR**.
