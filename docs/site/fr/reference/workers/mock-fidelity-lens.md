---
layout: doc
lang: fr
title: "mock-fidelity-lens"
description: "Reviewer lens: audits consumer-side mock wiring — resolved strategy honored, mock URL wired into the test host, no real downstream call, doubles the downstream not the SUT."
persona: software-engineer
---

# mock-fidelity-lens

> Lentille de revue conditionnelle : audite le câblage de mock côté consommateur dans les tests d'intégration selon quatre gates de fidélité — activée uniquement quand le diff touche un mock aval ou un test d'intégration qui en utilise un.

## Quand elle s'active

Activée par `software-engineer-reviewer` uniquement quand le diff examiné touche :
- Une configuration de mock aval (conteneur Microcks ou test double en mémoire)
- Un test d'intégration qui utilise un mock

Ce n'est pas une des lentilles de revue CORE. Elle rejoint le panel adverse conditionnellement, en tant que lentille de capacité.

## Entrées

- Code et tests du diff examiné
- Stratégie de mocking résolue (depuis le prompt ou `skraft.instructions.md`)

## Sortie

```json
{
  "lens": "mock-fidelity",
  "verdict": "pass | fail",
  "defects": [{ "id": "D<N>", "gate": "M<N>", "severity": "blocker | high", "location": "fichier:ligne", "description": "...", "suggestion": "..." }]
}
```

## Gates

| Gate | Vérification | Sévérité |
|------|------------|----------|
| M1 | Stratégie résolue honorée (inprocess → double DI ; microcks → conteneur Microcks) | high |
| M2 | Mock effectivement câblé dans le test host (URL injectée ou DI remplacé) | blocker |
| M3 | Pas de fuite d'appel aval réel | blocker |
| M4 | Double la dépendance aval, pas le domaine propre du SUT | high |

**Détail M1** : si `testing.mocking.strategy: inprocess` était en vigueur, le test doit utiliser un double en mémoire — pas un conteneur Microcks, et vice-versa.

**Détail M2** : un mock créé mais non injecté dans le client du SUT (URL mock non définie via `UseSetting`, remplacement DI manquant) → blocker.

## Invariants

- **Lecture seule** — ne modifie jamais le code ou les tests
- **Chaque constat nomme la gate** (M1–M4) et une localisation concrète `fichier:ligne`
- **Pas de journal, pas de checklist** — indépendance A7 : rapporte les constats sans contexte préalable

## Pourquoi cette forme

Un mock créé mais non câblé dans le client du SUT laisse silencieusement le vrai service être appelé, rendant le test non-déterministe. Chaque gate ferme un mode de défaillance à la frontière de transport.

> « Replace a component that the SUT depends on with a test-specific equivalent. »
> — Meszaros, G., *xUnit Test Patterns*, 2007.

## Voir aussi

- [mock-integration-worker]({{ "/fr/reference/workers/mock-integration-worker" | relative_url }}) — Worker qui produit le câblage de mock que cette lentille audite
- [mocking-strategy-roster]({{ "/fr/reference/skills/mocking-strategy-roster" | relative_url }}) — Résout la stratégie que cette lentille vérifie avoir été honorée
- [mocking-microcks-dotnet]({{ "/fr/reference/skills/mocking-microcks-dotnet" | relative_url }}) — Adaptateur par défaut dont cette lentille vérifie la sortie
- [mocking-inprocess-dotnet]({{ "/fr/reference/skills/mocking-inprocess-dotnet" | relative_url }}) — Adaptateur en surcharge dont cette lentille vérifie la sortie
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent DELIVER dont le panel de revue active cette lentille
