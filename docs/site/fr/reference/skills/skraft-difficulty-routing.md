---
layout: doc
lang: fr
title: "skraft-difficulty-routing"
description: "Use at DISCOVER exit to evaluate 3-axis routing (entry point, depth tier, difficulty tier), validate immutable invari..."
persona: tech-lead
---

# skraft-difficulty-routing

> Évalue trois axes orthogonaux à la sortie de la phase DISCOVER (point d'entrée, profondeur, difficulté) et persiste la décision dans `state.json` avant la transition vers DISCUSS.

## Quand l'utiliser

- À la sortie de la phase DISCOVER, une seule fois par exécution de pipeline
- Avant toute transition vers DISCUSS
- Invoqué par l'orchestrateur SKRAFT après validation des artefacts DISCOVER

## Contrat d'entrée

- Artefacts DISCOVER validés
- Préférences utilisateur explicites (si un `depthTier` non-`comprehensive` a été demandé)
- `state.json` existant ou créable à la racine du plan

## Contrat de sortie

- `state.json::entryPoint` — phases actives pour ce run
- `state.json::userPreferences.depthTier` — niveau de rigueur (`basic`, `standard`, `comprehensive`, `custom`)
- `state.json::difficulty` — modèle d'exécution DELIVER (`simple`, `medium`, `medium-hard`, `challenging`)
- Résumé de routage affiché à l'utilisateur (checklist emoji ✅ / 🛡️)
- `state.json::depthTierOverrides` appended si `depthTier != comprehensive`

## Invariants

- **TDD obligatoire** — au minimum Red-Green, sans exception pour aucun tier
- **Frontières Clean Architecture** — le Domain ne dépend ni de l'Application ni de l'Infrastructure
- **Intégrité des tests** — aucun test supprimé ni désactivé pour passer GREEN
- **Conformité du schéma `state.json`** — chaque tour produit un document valide
- **`comprehensive` par défaut** — toute réduction exige une décision explicite avec rationale
- **`custom` interdit les combinaisons invalides** — l'orchestrateur refuse et demande correction avant de continuer
- **Évaluation unique** — la difficulté est évaluée à la sortie de DISCOVER et jamais réévaluée en cours de pipeline

## Pourquoi cette forme

Un routage explicite évite la dérive silencieuse du niveau de qualité entre les runs. Persister la décision dans `state.json` la rend auditable et consultable par tous les agents.

> « Clean code reads like well-written prose. »
> — Martin, R. C., *Clean Code*, 2008.

Les invariants immuables garantissent qu'aucune configuration `custom` ne peut supprimer le TDD ou violer les frontières architecturales — la confiance dans le pipeline repose sur cette garantie.

## Customisation autorisée

- Choix du `depthTier` (`basic`, `standard`, `custom`) avec rationale (L1)
- `customDepth` par porte lorsque `depthTier: custom` (L2)
- Bypass de phases via `entryPoint` si les artefacts requis existent déjà (L2)

## Voir aussi

- [outside-in-tdd]({{ "/fr/reference/skills/outside-in-tdd" | relative_url }}) — Cycle TDD double-boucle (tier `comprehensive`)
- [mutation-testing]({{ "/fr/reference/skills/mutation-testing" | relative_url }}) — Seuils de mutation par `depthTier`
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent DELIVER qui consomme la difficulté
