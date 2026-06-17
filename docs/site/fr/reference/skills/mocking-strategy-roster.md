---
layout: doc
lang: fr
title: "mocking-strategy-roster"
description: "Use when an agent must mock a downstream HTTP/event dependency and needs to know which mocking strategy and stack adapter to use. Resolves (strategy × stack) — no agent hardcodes a mocking approach."
persona: tech-lead
---

# mocking-strategy-roster

> Deux axes orthogonaux — stratégie (microcks | inprocess) × stack : le point central qui résout comment une dépendance aval est simulée pour un test d'intégration.

## Quand l'utiliser

- Avant d'émettre le câblage de mock aval — chargé par [mock-integration-worker]({{ "/fr/reference/workers/mock-integration-worker" | relative_url }})
- Déterminer s'il faut utiliser un conteneur Microcks (défaut) ou un test double en mémoire (surcharge)
- Ajouter un adaptateur de stack (ajouter une ligne + un skill `mocking-{strategy}-{stack}`, zéro autre modification)

## Contrat d'entrée

- Prompt d'exécution (peut porter une surcharge de stratégie/bibliothèque — priorité la plus haute)
- `.github/instructions/skraft.instructions.md` champs `testing.mocking.strategy` et `testing.mocking.library` (lus par appel outil, jamais rappelés)

## Contrat de sortie

- Lien d'adaptateur résolu (ex. [mocking-microcks-dotnet]({{ "/fr/reference/skills/mocking-microcks-dotnet" | relative_url }}) ou [mocking-inprocess-dotnet]({{ "/fr/reference/skills/mocking-inprocess-dotnet" | relative_url }}))
- OU : payload `status: blocked` avec `type` et `context` si la stratégie/bibliothèque/stack n'est pas supportée

## Invariants

- **Lire les surcharges par appel outil** — jamais depuis le rappel ; si le fichier est absent, utiliser le défaut `microcks`
- **Cascade** : prompt explicite > `skraft.instructions.md` `testing.mocking.*` > défaut `microcks`
- **Stratégie inconnue → stop** — émettre `status: blocked` avec `type: unsupported_mocking_strategy` ; ne jamais inventer un câblage
- **Bibliothèque inconnue quand `strategy: inprocess` → stop** — émettre `status: blocked` avec `type: unsupported_mocking_library`
- **Ajouter une stratégie ou un stack = un adaptateur + une ligne de table** — zéro modification de ce skill ou du worker

## Pourquoi cette forme

Centraliser la décision de routage évite que chaque worker encode une approche de mocking. Les deux axes (stratégie et stack) sont indépendants : un nouveau stack s'insère sans toucher à la logique de stratégie, et vice-versa.

> « Replace a component that the SUT depends on with a test-specific equivalent. »
> — Meszaros, G., *xUnit Test Patterns*, 2007.

## Table des adaptateurs

| Stratégie | Stack | Adaptateur | Statut |
|-----------|-------|-----------|--------|
| microcks | .NET | [mocking-microcks-dotnet]({{ "/fr/reference/skills/mocking-microcks-dotnet" | relative_url }}) | supporté |
| inprocess | .NET | [mocking-inprocess-dotnet]({{ "/fr/reference/skills/mocking-inprocess-dotnet" | relative_url }}) | supporté |
| microcks | Java | *(mocking-microcks-java non encore fourni)* | NON SUPPORTÉ |
| inprocess | Java | *(mocking-inprocess-java non encore fourni)* | NON SUPPORTÉ |

## Customisation autorisée

- Adaptateurs de stratégie/stack ajoutés indépendamment (aucune modification de ce skill ou du worker)

## Voir aussi

- [mocking-microcks-dotnet]({{ "/fr/reference/skills/mocking-microcks-dotnet" | relative_url }}) — Adaptateur par défaut (Microcks) pour .NET
- [mocking-inprocess-dotnet]({{ "/fr/reference/skills/mocking-inprocess-dotnet" | relative_url }}) — Adaptateur en surcharge (in-process) pour .NET
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent DELIVER qui déclenche le worker qui charge ce skill
