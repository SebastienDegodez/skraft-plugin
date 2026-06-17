---
layout: doc
lang: fr
title: "contract-testing-dotnet"
description: "Use when contract-testing-roster resolved a .NET stack. Always emits a WebApplicationFactory baseline; adds Microcks TestEndpointAsync when the opt-in is set."
persona: tech-lead
---

# contract-testing-dotnet

> Adaptateur .NET concret pour un test de contrat côté fournisseur : la couche 1 (WebApplicationFactory) est toujours émise ; la couche 2 (Microcks TestEndpointAsync) est additive quand l'opt-in est activé.

## Quand l'utiliser

- Quand [contract-testing-roster]({{ "/fr/reference/skills/contract-testing-roster" | relative_url }}) a résolu `.NET` comme stack
- Émettre le test d'intégration de base (couche 1 — toujours requis)
- Empiler la couche de vérification de contrat Microcks (couche 2 — uniquement quand `microcks: true`)

## Contrat d'entrée

- Stack résolu comme .NET par [contract-testing-roster]({{ "/fr/reference/skills/contract-testing-roster" | relative_url }})
- Flag opt-in Microcks : `false` (défaut) | `true`
- Artefacts de contrat (`{api}.yaml` + `.apiexamples.yaml` + `.apimetadata.yaml`) si opt-in est `true`

## Contrat de sortie

- **Couche 1** (toujours) : `WebApplicationFactory<Program>` + `HttpClient` typé — test d'intégration vérifiant code de statut, content type et forme `ProblemDetails` sur les chemins d'erreur
- **Couche 2** (opt-in seulement) : `MicrocksContainer` + `TestEndpointAsync(TestRequest{ OPEN_API_SCHEMA })` contre `host.testcontainers.internal:{port}`
- Bloc de résultat structuré : `stack`, `microcks`, `files[]`, `testCommand`

## Invariants

- **La couche 1 est TOUJOURS émise** — indépendamment du flag opt-in
- **La couche 2 est ADDITIVE** — ne remplace jamais la couche 1, jamais émise sans elle
- **La couche 2 nécessite un vrai port Kestrel** — `WebApplicationFactory` n'expose aucun port TCP ; démarrer le SUT via une factory partagée et lire le port depuis `IServerAddressesFeature`
- **`TestEndpointAsync` pas `VerifyAsync`** — `VerifyAsync` retourne un `bool` vérifiant qu'un mock a été appelé (côté consommateur) ; ne jamais l'utiliser pour la conformité fournisseur
- **Ne jamais supprimer un `TestResult` en échec** — `Assert.True(testResult.Success, ...)` ne doit pas être supprimé ou ignoré
- **API réelle** — `MicrocksBuilder...Build()` + `await StartAsync()` ; `WithMainArtifacts(params string[])` ; pas de `BuildAsync()`, pas de `WithMainArtifact` au singulier
- **Commande de test via [resolving-stack-commands]({{ "/fr/reference/skills/resolving-stack-commands" | relative_url }})** — ne jamais coder en dur `dotnet test`

## Pourquoi cette forme

Un serveur de test en mémoire valide le câblage applicatif sans couplage à une dépendance réelle. Empiler une couche Microcks rejoue les exemples du contrat publié contre le service en cours d'exécution, faisant de la conformité une gate déterministe.

> « Replace a component that the SUT depends on with a test-specific equivalent. »
> — Meszaros, G., *xUnit Test Patterns*, 2007.

## Customisation autorisée

- Image Microcks dans `MicrocksBuilder.WithImage(...)` (L1)
- Port exposé via `TestcontainersSettings.ExposeHostPortsAsync(...)` (L1)
- Fixture partagée via `MicrocksFixture` + `ICollectionFixture` (L2)

## Voir aussi

- [contract-testing]({{ "/fr/reference/skills/contract-testing" | relative_url }}) — Authoring générique de contrats (OpenAPI, échantillons Microcks, liaison d'artefacts)
- [contract-testing-roster]({{ "/fr/reference/skills/contract-testing-roster" | relative_url }}) — Résout cet adaptateur et le flag opt-in
- [resolving-stack-commands]({{ "/fr/reference/skills/resolving-stack-commands" | relative_url }}) — Résout la commande de test
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent DELIVER qui déclenche cet adaptateur
