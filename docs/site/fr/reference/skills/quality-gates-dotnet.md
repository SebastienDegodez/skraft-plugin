---
layout: doc
lang: fr
title: "quality-gates-dotnet"
description: "Use when the active repository is a .NET solution (`.sln` / `.csproj` present) and the software-engineer must populat..."
persona: tech-lead
---

# quality-gates-dotnet

> Adaptateur .NET qui lie les portes qualité du contrat `quality-gates-evidence-contract` aux commandes concrètes `dotnet` et `dotnet stryker`.

## Quand l'utiliser

- Lorsque le dépôt actif est une solution .NET (`*.sln`, `*.slnx`, `*.csproj`, `Directory.Packages.props`)
- En phase COMMIT, pour produire les preuves falsifiables des portes G1 à G10
- Au RED, pour capturer le run qui prouve que le test échoue — la seule preuve acceptée par G10, et elle ne peut pas être reconstituée après coup
- Chargé par le `software-engineer` après détection de la pile .NET via `resolving-stack-commands`
- Si plusieurs piles coexistent, exécuté en parallèle des autres adaptateurs

## Contrat d'entrée

- Dépôt .NET détecté (marqueur `*.sln` ou `*.csproj` présent à la racine)
- Variable `$EV` pointant vers `.copilot-tracking/skraft-plans/{projectSlug}/evidence/{date}/`
- `state.json::userPreferences.depthTier` pour le seuil de mutation G6

## Contrat de sortie

- Fichiers de preuves dans `$EV/` : stdout redirigé sur disque, code de sortie, sha256, snapshots RED/GREEN
- Entrées `gates[G1..G10]` du contrat `quality-gates-evidence-contract` renseignées
- `qg-{story}.json` complet et vérifiable par le `quality-gates-lens`

## Invariants

- **Commandes verbatim** — `command_executed` contient la commande shell exacte, jamais paraphrasée
- **Stdout capturé par le shell** — jamais transcrit à la main ; `sha256` calculé par `shasum`
- **G7 inversion** — `grep` exit `1` (aucune correspondance) est le cas succès pour G7
- **Seuil G6 par `depthTier`** : `basic` ≥ 80, `standard` ≥ 90, `comprehensive` ≥ 100
- **Outil absent = `fail`**, jamais `not_applicable` si l'outil n'est pas installé
- **G5 marqué `not_applicable`** uniquement si aucun projet `*.ArchitectureTests` n'existe, avec `rationale`

## Pourquoi cette forme

La falsifiabilité est non négociable : un agent ne peut pas prouver qu'un test est passé en le disant. Chaque porte dépose des artefacts sur disque, référençables par sha256 et chemin Git, que le lens peut vérifier sans ré-exécution.

> « The two rules of TDD: write new code only if an automated test has failed; eliminate duplication. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

Les preuves sur disque rendent l'attestation vérifiable de façon reproductible — même des semaines après la livraison.

## Customisation autorisée

- Seuils G6 (via `state.json::userPreferences.depthTier`) (L2)
- G5 optionnel selon présence du projet `*.ArchitectureTests` (L1)
- G4 mutualisé avec G3 si les analyseurs Roslyn sont câblés dans le build (L1)

## Voir aussi

- [quality-gates-evidence-contract]({{ "/fr/reference/skills/quality-gates-evidence-contract" | relative_url }}) — Schéma tech-agnostique
- [resolving-stack-commands]({{ "/fr/reference/skills/resolving-stack-commands" | relative_url }}) — Détection de pile et sélection d'adaptateur
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent producteur des preuves
