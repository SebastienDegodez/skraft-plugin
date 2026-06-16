---
layout: doc
lang: fr
title: "test-refactoring-catalog"
description: "Use when refactoring tests — extracting helpers, renaming for business clarity, deduplicating fixtures, consolidating..."
persona: tech-lead
---

# test-refactoring-catalog

> Catalogue de transformations sûres pour le code de test — chaque transformation préserve la couverture comportementale tout en améliorant la lisibilité, la maintenabilité et le rapport signal/bruit.

## Quand l'utiliser

- Après GREEN : les tests passent, on identifie duplication ou nommage peu clair
- Pendant COMMIT & VERIFY : nettoyage avant commit, sans nouveau comportement ajouté
- En revue de code de test présentant des odeurs (arrange long, setup répété, noms cryptiques)

## Contrat d'entrée

- Suite de tests entièrement verte
- Phase GREEN atteinte et confirmée
- Code de production stabilisé (pas de refactoring production en parallèle)

## Contrat de sortie

- Tests refactorisés selon les règles R1–R7 du catalogue
- Suite de tests toujours verte après chaque transformation appliquée
- Aucune couverture comportementale perdue

## Invariants

- **Toute transformation préserve le comportement** — suite verte avant ET après ; lancer la suite avant chaque application
- **Revert immédiat si rouge** — tout test qui passe au rouge pendant le refactoring → revert avant de continuer
- **Pas de nouveau comportement** — le catalogue restructure, il n'ajoute pas de cas de test
- **R6 — Helper à usage unique = bruit** — un helper appelé une seule fois est inline, pas extrait
- **R3 — Même scénario uniquement** — les méthodes ne se consolident en `[Theory]` que si elles représentent la même classe de comportement ; des assertions différentes = scénarios différents

## Pourquoi cette forme

Un test bien nommé est une spécification exécutable. Refactorer les tests améliore la documentation vivante sans toucher à la couverture. Le flux de décision R1–R7 évite les sur-ingénieries : chaque transformation répond à une odeur précise et s'arrête là.

> « Any fool can write code that a computer can understand. Good programmers write code that humans can understand. »
> — Fowler, M., *Refactoring, 2nd ed.*, 2018.

La règle de comportement-préservation s'applique avec la même rigueur que la règle « Iron Rule of Tests » : on ne supprime pas, on ne neutralise pas.

## Customisation autorisée

- Conventions de nommage des helpers (préfixe `A`, `An`, `Create` + nom métier) (L1)
- Pattern de nommage des tests (`When<Condition>_Should<Outcome>`) (L1)
- Seuil de consolidation R3 (nombre de méthodes similaires avant merge) (L2)

## Voir aussi

- [craft-discipline]({{ "/fr/reference/skills/craft-discipline" | relative_url }}) — Checkpoints d'auto-discipline avant commit
- [outside-in-tdd]({{ "/fr/reference/skills/outside-in-tdd" | relative_url }}) — Cycle TDD (phase REFACTOR)
- [test-design-mandates]({{ "/fr/reference/skills/test-design-mandates" | relative_url }}) — Mandats de conception des tests
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent qui exécute ce catalogue
