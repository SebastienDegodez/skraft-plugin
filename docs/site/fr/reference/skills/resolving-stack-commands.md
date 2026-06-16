---
layout: doc
lang: fr
title: "resolving-stack-commands"
description: "Use whenever an agent must run a toolchain command (build, test, mutation) and needs the concrete invocation. Resolve..."
persona: tech-lead
---

# resolving-stack-commands

> Point de résolution unique qui mappe la pile détectée dans le dépôt vers les commandes concrètes de build, test et mutation — aucun agent n'encode une commande en dur.

## Quand l'utiliser

- Chaque fois qu'un agent doit lancer une commande de build, test ou mutation
- Chargé par l'`acceptance-designer` et le `software-engineer` avant toute exécution d'outil de pile
- Avant de résoudre les portes qualité (`quality-gates-evidence-contract`)

## Contrat d'entrée

- Marqueurs de pile présents à la racine du dépôt (`*.sln`, `pom.xml`, etc.)
- Intention déclarée : `build`, `test` ou `mutation`

## Contrat de sortie

- Commande concrète résolue depuis l'adaptateur `quality-gates-<tech>` correspondant
- Ou bloc structuré `status: blocked` si la pile détectée n'a pas d'adaptateur

## Invariants

- **Zéro commande en dur** — aucun agent n'écrit `dotnet test`, `mvn test` ou toute commande de pile directement
- **Pile non supportée → STOP** — jamais de commande inventée ; toujours un bloquant structuré avec `stack`, `markers`, `needed`
- **Piles multiples** — chaque adaptateur est exécuté indépendamment et les résultats sont agrégés
- **Ajout de pile = ajout d'adaptateur uniquement** — zéro modification des agents existants

## Pourquoi cette forme

La pipeline doit fonctionner avec .NET aujourd'hui et d'autres piles demain (Java planifié, pas encore supporté). Centraliser le mappage garde tous les agents tech-agnostiques : ils disent « construire la solution », ce skill dit comment.

> « The two rules of TDD: write new code only if an automated test has failed; eliminate duplication. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

La règle s'applique aussi à la configuration : dupliquer une commande de build dans chaque agent revient à dupliquer la logique dans chaque point d'appel — le même antipattern que la duplication de code métier.

## Customisation autorisée

- Ajout de nouvelles lignes de détection et d'adaptateurs `quality-gates-<tech>` (L2)
- Piles coexistantes avec agrégation de résultats (L2)

## Voir aussi

- [quality-gates-dotnet]({{ "/fr/reference/skills/quality-gates-dotnet" | relative_url }}) — Adaptateur .NET (supporté)
- [quality-gates-evidence-contract]({{ "/fr/reference/skills/quality-gates-evidence-contract" | relative_url }}) — Contrat de preuves tech-agnostique
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent appelant principal
- [acceptance-designer]({{ "/fr/reference/agents/acceptance-designer" | relative_url }}) — Agent appelant en phase DISTILL
