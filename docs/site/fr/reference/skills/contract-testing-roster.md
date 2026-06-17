---
layout: doc
lang: fr
title: "contract-testing-roster"
description: "Use when an agent must produce a provider-side contract test and needs to know the stack adapter and whether the Microcks opt-in is enabled. Loaded by contract-testing-worker."
persona: tech-lead
---

# contract-testing-roster

> Un axe (stack) + un booléen (opt-in) : résout comment un test de contrat côté fournisseur est construit — ne jamais coder la décision en dur dans un worker.

## Quand l'utiliser

- Avant d'émettre un test de contrat côté fournisseur — chargé par [contract-testing-worker]({{ "/fr/reference/workers/contract-testing-worker" | relative_url }})
- Déterminer si la couche de vérification Microcks doit être ajoutée en plus de la baseline
- Ajouter un adaptateur de stack (ajouter une ligne + un skill `contract-testing-{stack}`, zéro autre modification)

## Contrat d'entrée

- Prompt d'exécution (peut porter une demande opt-in explicite — priorité la plus haute)
- `.github/instructions/skraft.instructions.md` champ `testing.contract.microcks` (lu par appel outil, jamais rappelé)

## Contrat de sortie

- Lien d'adaptateur résolu (ex. [contract-testing-dotnet]({{ "/fr/reference/skills/contract-testing-dotnet" | relative_url }})) + flag opt-in
- OU : payload `status: blocked` avec `type` et `context` si la valeur opt-in est invalide ou si le stack n'a pas d'adaptateur

## Invariants

- **Lire l'opt-in par appel outil** — jamais depuis le rappel ; si le fichier est absent, utiliser le défaut `false`
- **Cascade** : prompt explicite > `skraft.instructions.md` `testing.contract.microcks` > défaut `false`
- **Valeur inconnue → stop** — émettre `status: blocked` avec `type: invalid_contract_optin` ; ne jamais deviner
- **Stack non supporté → stop** — émettre `status: blocked` avec `type: unsupported_stack`
- **Ajouter un stack = un adaptateur + une ligne de table** — zéro modification de ce skill ou du worker

## Pourquoi cette forme

Centraliser la décision de routage dans un seul skill évite que chaque worker suppose un stack. Tout nouveau stack s'insère sans toucher aux agents existants.

> « Consumer-driven contracts let the consumer specify what it needs from a provider. »
> — Newman, S., *Building Microservices, 2nd ed.*, 2021.

## Table des adaptateurs de stack

| Stack | Adaptateur | Statut |
|-------|-----------|--------|
| .NET | [contract-testing-dotnet]({{ "/fr/reference/skills/contract-testing-dotnet" | relative_url }}) | supporté |
| Java | *(contract-testing-java non encore fourni)* | NON SUPPORTÉ |

## Customisation autorisée

- Adaptateurs de stack ajoutés indépendamment (aucune modification de ce skill ou du worker)

## Voir aussi

- [contract-testing]({{ "/fr/reference/skills/contract-testing" | relative_url }}) — Authoring générique de contrats (OpenAPI, échantillons Microcks)
- [contract-testing-dotnet]({{ "/fr/reference/skills/contract-testing-dotnet" | relative_url }}) — Adaptateur .NET résolu par ce roster
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent DELIVER qui déclenche le worker qui charge ce skill
