---
layout: doc
lang: fr
title: "mocking-microcks-dotnet"
description: "Use when mocking-strategy-roster resolved (microcks, .NET). Provides the MicrocksContainerEnsemble wiring and WebApplicationFactory scaffold pointing the SUT's typed HttpClient at the mock URL."
persona: tech-lead
---

# mocking-microcks-dotnet

> Adaptateur .NET par défaut : simule une dépendance aval depuis son contrat OpenAPI/examples via un `MicrocksContainerEnsemble`, et câble le client du SUT sur l'endpoint mock.

## Quand l'utiliser

- Quand [mocking-strategy-roster]({{ "/fr/reference/skills/mocking-strategy-roster" | relative_url }}) a résolu `(microcks, .NET)`
- Configurer un `MicrocksContainerEnsemble` alimenté depuis le contrat de la dépendance aval
- Pointer le `HttpClient` du SUT vers l'endpoint mock Microcks via `UseSetting`

## Contrat d'entrée

- Stratégie résolue comme `microcks`, stack comme `.NET` par [mocking-strategy-roster]({{ "/fr/reference/skills/mocking-strategy-roster" | relative_url }})
- Chemin de l'artefact OpenAPI / examples de la dépendance aval
- Clé de configuration du SUT pour l'URL de base aval (pour `UseSetting`)

## Contrat de sortie

- `{Sut}WebApplicationFactory<TProgram>` avec `MicrocksContainerEnsemble` + `WithMainArtifacts(...)` + `GetRestMockEndpoint(name, version)` → `UseSetting`
- Bloc de résultat structuré : `strategy`, `stack`, `files[]`, `testCommand`

## Invariants

- **Simuler la dépendance aval, pas le SUT** — le conteneur remplace ce que le SUT appelle
- **`GetRestMockEndpoint(name, version)`** — note : `+` encode un espace dans le nom du service (ex. `"API+Pastries"`)
- **`VerifyAsync` / `GetServiceInvocationsCountAsync`** — côté consommateur uniquement : affirmer que le mock a été appelé ; PAS la conformité de contrat fournisseur
- **NuGet** : `Microcks.Testcontainers` + `Testcontainers` (ne pas référencer les packages `TestContainers` non liés)
- **Commande de test via [resolving-stack-commands]({{ "/fr/reference/skills/resolving-stack-commands" | relative_url }})** — ne jamais coder en dur `dotnet test`

## Pourquoi cette forme

Un conteneur Microcks rejoue les exemples du contrat publié de la dépendance aval comme un mock réel, s'assurant que la sérialisation et le routage du client du SUT correspondent à ce que le contrat spécifie — sans couplage à un vrai service réel.

> « Consumer-driven contracts let the consumer specify what it needs from a provider. »
> — Newman, S., *Building Microservices, 2nd ed.*, 2021.

## Customisation autorisée

- Version de l'image Microcks dans le constructeur `MicrocksContainerEnsemble` (L1)
- Artefacts supplémentaires via `WithMainArtifacts(...)` pour des scénarios multi-dépendances (L2)

## Voir aussi

- [mocking-strategy-roster]({{ "/fr/reference/skills/mocking-strategy-roster" | relative_url }}) — Résout `(stratégie × stack)` et pointe vers cet adaptateur
- [mocking-inprocess-dotnet]({{ "/fr/reference/skills/mocking-inprocess-dotnet" | relative_url }}) — Adaptateur en surcharge (in-process) pour le même stack .NET
- [contract-testing]({{ "/fr/reference/skills/contract-testing" | relative_url }}) — Authoring du contrat aval qui alimente ce mock
- [resolving-stack-commands]({{ "/fr/reference/skills/resolving-stack-commands" | relative_url }}) — Résout la commande de test
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent DELIVER qui déclenche le worker qui charge ce skill
