---
layout: doc
lang: fr
title: "contract-testing"
description: "Use when authoring OpenAPI/AsyncAPI contracts, generating Microcks samples, setting up Testcontainers mocks, or verifying provider contracts across DESIGN → DISTILL → DELIVER phases."
persona: tech-lead
---

# contract-testing

> Développement API contract-first : le contrat est la source de vérité à travers DESIGN → DISTILL → DELIVER.

## Quand l'utiliser

- Écrire un contrat OpenAPI 3.1 ou AsyncAPI 2.6.0 (phase DESIGN)
- Générer des échantillons Microcks (`.apiexamples.yaml`, `.apimetadata.yaml`) depuis un contrat (phase DISTILL)
- Configurer un `MicrocksContainer` ou `MicrocksContainerEnsemble` pour simuler une dépendance aval (phase DELIVER)
- Vérifier une implémentation fournisseur avec `TestEndpointAsync(TestRequest{ OPEN_API_SCHEMA })`
- Propager atomiquement une montée de version `info.version` à travers tous les artefacts DESIGN → DISTILL → DELIVER

## Contrat d'entrée

- Nom du bounded context et identifiants des ressources (nommage fichiers : kebab-case)
- Adaptateur de stack résolu via [contract-testing-roster]({{ "/fr/reference/skills/contract-testing-roster" | relative_url }})
- Artefacts DISTILL (`.apiexamples.yaml` + `.apimetadata.yaml`) présents avant d'entrer dans DELIVER

## Contrat de sortie

- **DESIGN** : YAML OpenAPI / AsyncAPI dans `.copilot-tracking/skraft-plans/{slug}/details/{date}/contracts/{name}.yaml`
- **DISTILL** : `.apiexamples.yaml` + `.apimetadata.yaml` par contrat, `metadata.name` correspondant à `info.title - info.version`
- **DELIVER** : test fournisseur `TestEndpointAsync` ou mock consommateur `MicrocksContainer` câblé dans le test host

## Invariants

- **Le contrat est la source de vérité** — l'implémentation est vérifiée contre lui, jamais l'inverse
- **Le câblage DELIVER est spécifique au stack** — toujours résoudre via [contract-testing-roster]({{ "/fr/reference/skills/contract-testing-roster" | relative_url }})
- **Ordre d'import `WithMainArtifacts`** — schema en premier, `.apiexamples.yaml` en deuxième, `.apimetadata.yaml` en troisième, en un seul appel
- **`TestEndpointAsync` pas `VerifyAsync`** — `VerifyAsync` vérifie le nombre d'invocations de mock (côté consommateur) ; `TestEndpointAsync(OPEN_API_SCHEMA)` est la conformité fournisseur
- **Ne jamais supprimer un `TestResult` en échec** — `Assert.True(result.Success)` est obligatoire ; ne jamais sauter ou commenter

## Pourquoi cette forme

Coupler les tests à un service aval réel rend la suite fragile et non-déterministe. Publier un contrat permet au consommateur et au fournisseur d'évoluer indépendamment tout en garantissant l'interopérabilité à la frontière.

> « Consumer-driven contracts let the consumer specify what it needs from a provider. »
> — Newman, S., *Building Microservices, 2nd ed.*, 2021.

## Customisation autorisée

- Type de dispatcher par opération : `JSON_BODY` | `JS` | `GROOVY` (L1)
- Version de l'image Microcks dans `MicrocksBuilder.WithImage(...)` (L1)
- Ensemble multi-services via `MicrocksContainerEnsemble` (L2)
- Variante Docker Compose pour démarrage d'environnement complet avec `MicrocksContainerEnsemble` (L2)

## Voir aussi

- [contract-testing-roster]({{ "/fr/reference/skills/contract-testing-roster" | relative_url }}) — Résout l'adaptateur de stack et l'opt-in Microcks
- [contract-testing-dotnet]({{ "/fr/reference/skills/contract-testing-dotnet" | relative_url }}) — Adaptateur .NET : baseline WAF + couche Microcks optionnelle
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent DELIVER qui utilise ce skill
