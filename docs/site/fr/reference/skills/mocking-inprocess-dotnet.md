---
layout: doc
lang: fr
title: "mocking-inprocess-dotnet"
description: "Use when mocking-strategy-roster resolved (inprocess, .NET). Provides the concrete in-process test double registered in the WebApplicationFactory DI instead of a Microcks container."
persona: tech-lead
---

# mocking-inprocess-dotnet

> Adaptateur .NET in-process (surcharge) : remplace une dépendance aval par un test double enregistré dans le DI de WebApplicationFactory — sélectionné quand l'opérateur surcharge le défaut Microcks.

## Quand l'utiliser

- Quand [mocking-strategy-roster]({{ "/fr/reference/skills/mocking-strategy-roster" | relative_url }}) a résolu `(inprocess, .NET)`
- Remplacer un client HTTP aval par un test double en mémoire (FakeItEasy, NSubstitute, ou Moq)
- Quand un conteneur Microcks n'est pas disponible ou explicitement surchargé par l'opérateur

## Contrat d'entrée

- Stratégie résolue comme `inprocess`, stack comme `.NET` par [mocking-strategy-roster]({{ "/fr/reference/skills/mocking-strategy-roster" | relative_url }})
- Bibliothèque résolue (prompt > `skraft.instructions.md` `testing.mocking.library` > table de priorité)
- Interface client aval `I{Downstream}Client` identifiée

## Contrat de sortie

- `{Sut}ApiFactory : WebApplicationFactory<Program>` avec `RemoveAll<I{Downstream}Client>()` + `AddSingleton(DownstreamDouble)`
- Propriété `DownstreamDouble` exposant le double pour l'arrangement par test
- Bloc de résultat structuré : `strategy`, `stack`, `library`, `files[]`, `testCommand`

## Invariants

- **Doubler l'interface du client aval, pas le domaine propre du SUT** — c'est un test double d'intégration à la frontière HTTP
- **Priorité de bibliothèque (première trouvée dans le projet de test l'emporte)** : FakeItEasy > NSubstitute > Moq
- **`RemoveAll` avant `AddSingleton`** — évite les enregistrements en double
- **Commande de test via [resolving-stack-commands]({{ "/fr/reference/skills/resolving-stack-commands" | relative_url }})** — ne jamais coder en dur `dotnet test`

## Table des bibliothèques (ordre de priorité — haut = plus haute)

| Priorité | Bibliothèque | NuGet | Création du double |
|----------|-------------|-------|-------------------|
| 1 | FakeItEasy | `FakeItEasy` | `A.Fake<I{Downstream}Client>()` |
| 2 | NSubstitute | `NSubstitute` | `Substitute.For<I{Downstream}Client>()` |
| 3 | Moq | `Moq` | `new Mock<I{Downstream}Client>()` (utiliser `.Object`) |

## Pourquoi cette forme

Substituer une dépendance dans le conteneur DI à la frontière de transport maintient les tests rapides et déterministes sans surcharge de conteneur, tout en exerçant la vraie composition applicative.

> « Replace a component that the SUT depends on with a test-specific equivalent. »
> — Meszaros, G., *xUnit Test Patterns*, 2007.

## Customisation autorisée

- Choix de la bibliothèque (L1, suit la table de priorité si non nommée)
- Remplacements DI supplémentaires pour des clients aval secondaires (L2)

## Voir aussi

- [mocking-strategy-roster]({{ "/fr/reference/skills/mocking-strategy-roster" | relative_url }}) — Résout `(stratégie × stack)` et pointe vers cet adaptateur
- [mocking-microcks-dotnet]({{ "/fr/reference/skills/mocking-microcks-dotnet" | relative_url }}) — Adaptateur par défaut (Microcks) pour le même stack .NET
- [resolving-stack-commands]({{ "/fr/reference/skills/resolving-stack-commands" | relative_url }}) — Résout la commande de test
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent DELIVER qui déclenche le worker qui charge ce skill
