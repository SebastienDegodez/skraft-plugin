---
layout: doc
lang: fr
title: "mutation-testing"
description: "Use when entering COMMIT & VERIFY phase, killing surviving mutants, verifying test quality via mutation score, or ana..."
persona: tech-lead
---

# mutation-testing

> Vérifie que les tests détectent réellement des bugs — pas seulement qu'ils exécutent du code — en entrant dans la phase COMMIT & VERIFY du cycle TDD.

## Quand l'utiliser

- Entrer dans la phase 4 (COMMIT & VERIFY) du cycle TDD
- Investiguer un mutant survivant après que la baseline de tests est verte
- Confirmer qu'un kill est effectif après l'écriture d'un test de frontière
- Vérifier la qualité des tests avant une fusion

**Ne jamais exécuter sur une baseline rouge** — corriger les tests d'abord.

## Contrat d'entrée

- Baseline de tests 100% verte
- `dotnet stryker` disponible (`dotnet tool install -g dotnet-stryker` si absent)
- Chemins identifiés : `--project` (csproj de production) et `-tp` (csproj de tests)

## Contrat de sortie

- Le code de sortie du runner, par scope : le cœur d'abord, puis la frontière
- Liste des mutants survivants classifiés : **réel** (test manquant) ou **équivalent** (aucun effet observable)
- Tests de frontière ajoutés pour chaque survivant réel
- Verdict : ✅ Continuer vers commit / ❌ BLOQUER — retourner à l'étape 4 tant qu'un survivant réel subsiste

## Invariants

- **S7 — Exécution déterministe** — Les tests de mutation DOIVENT être exécutés via des appels d'outils terminal. Ne pas affirmer des résultats depuis de la prose
- **Un test qui ne tue aucun mutant est du bruit** — le supprimer
- **Exclusions de scope** — Ne jamais muter : `DependencyInjection.cs`, `Program.cs`, interfaces marqueurs, code généré. Tout ce qu'un développeur a écrit est dans le scope, DTOs et adaptateurs inclus ; API et Infrastructure passent en second, tenus à leur propre barre
- **C'est le runner qui tranche** — `--break-at` fait échouer le run sous la barre, donc le code de sortie est le verdict. `skraft-quality-bar` énonce la barre de chaque scope

## Pourquoi cette forme

La couverture de code mesure l'exécution, pas la détection de bugs. Le test de mutation injecte des défauts contrôlés (opérateurs arithmétiques, comparaisons, booléens, conditionnels, valeurs de retour, LINQ) et vérifie que les tests échouent. Un mutant qui survit révèle un cas limite non testé ou un test insuffisamment assertif.

> « A test that kills no mutant is noise. DELETE IT. »

Le flux déterministe en 5 étapes (run → parse JSON → classify → kill → re-run scoped) garantit une confiance reproductible dans la qualité des tests, indépendamment de l'interprétation humaine.

## Customisation autorisée

- Seuils `--break-at`, `--threshold-high`, `--threshold-low` (L1)
- Patterns d'exclusion `--mutate "!..."` (L1)
- Mode `--since:main` pour développement rapide vs `--mutate "**/*.cs"` avant merge (L2)

## Voir aussi

- [outside-in-tdd]({{ "/fr/reference/skills/outside-in-tdd" | relative_url }}) — Cycle TDD dont la phase COMMIT & VERIFY utilise ce skill
- [craft-discipline]({{ "/fr/reference/skills/craft-discipline" | relative_url }}) — Checkpoints d'auto-discipline avant commit
- [quality-gates-evidence-contract]({{ "/fr/reference/skills/quality-gates-evidence-contract" | relative_url }}) — Contrat d'évidence qui consomme le score de mutation
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent DELIVER qui exécute ce skill
