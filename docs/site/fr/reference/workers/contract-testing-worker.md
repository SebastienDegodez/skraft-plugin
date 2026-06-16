---
layout: doc
lang: fr
title: "contract-testing-worker"
description: "[Internal worker — dispatched by software-engineer only] Emits a provider-side contract test. Always produces the baseline WebApplicationFactory + HttpClient test; adds Microcks TestEndpointAsync when the opt-in is set."
persona: software-engineer
---

# contract-testing-worker

> Worker interne dispatché par `software-engineer` pendant DELIVER : produit le test de contrat côté fournisseur pour l'API de CE service — baseline toujours, Microcks opt-in additif.

## Quand il s'active

Dispatché par `software-engineer` pendant la phase DELIVER quand un test de contrat côté fournisseur est nécessaire pour la slice d'API active. Non invocable directement par l'utilisateur.

**Ce worker est côté fournisseur** : il vérifie que notre propre API se comporte comme le contrat l'indique. Il ne simule PAS une dépendance aval — c'est le rôle de [mock-integration-worker]({{ "/fr/reference/workers/mock-integration-worker" | relative_url }}).

## Entrées

**Requis :**
- Descripteur d'API (fournisseur) pour la slice active

**Contexte :**
- Artefacts de contrat (`{api}.yaml` + `.apiexamples.yaml` + `.apimetadata.yaml`) si présents
- `.copilot-tracking/skraft-plans/{slug}/state.json`
- Prompt d'exécution (peut demander l'opt-in Microcks)
- `.github/instructions/skraft.instructions.md` — namespace `testing.contract.*`

## Sortie

Bloc de résultat structuré retourné au lead — pas de commit :

```yaml
status: ok
capability: contract-testing
stack: dotnet
microcks: false | true
files:
  - <chemins relatifs créés>
testCommand: <commande de test résolue>
notes: baseline always ; Microcks TestEndpointAsync(OPEN_API_SCHEMA) added iff opt-in
```

## Workflow

1. Charger [contract-testing-roster]({{ "/fr/reference/skills/contract-testing-roster" | relative_url }}) — résoudre stack + opt-in via la cascade (prompt > `skraft.instructions.md` > défaut `false`)
2. Sur blocker (opt-in invalide / stack non supporté) : retourner verbatim le payload `blocked` du roster
3. Charger l'adaptateur `contract-testing-{stack}` résolu et émettre la couche 1 (toujours) + couche 2 (opt-in)
4. Résoudre la commande de test via [resolving-stack-commands]({{ "/fr/reference/skills/resolving-stack-commands" | relative_url }})
5. Retourner le résultat structuré au lead

## Invariants

- **La couche 1 (baseline WAF + HttpClient) est TOUJOURS émise**, indépendamment de l'opt-in
- **La couche 2 (Microcks TestEndpointAsync) est ADDITIVE** — ne remplace jamais la couche 1
- **Lire l'opt-in par appel outil** — jamais depuis le rappel (S6 RULE BRIDGE)
- **Résoudre la commande de test** via `resolving-stack-commands` — ne jamais coder en dur (S7 DETERMINISTIC TOOL BRIDGE)
- **Pas de commit** — retourne un résultat structuré ; le lead commite

## Pourquoi cette forme

Séparer le worker (câblage de contrat) du lead (TDD métier) maintient chaque responsabilité à son scope naturel. Le lead intègre le test fournisseur dans la boucle TDD sans déléguer la logique métier au worker.

> « Start with a failing test that describes the behaviour you want, guided by tests from the outside in. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

## Voir aussi

- [contract-testing-roster]({{ "/fr/reference/skills/contract-testing-roster" | relative_url }}) — Résout le stack et l'opt-in
- [contract-testing-dotnet]({{ "/fr/reference/skills/contract-testing-dotnet" | relative_url }}) — Adaptateur .NET appliqué par ce worker
- [contract-testing]({{ "/fr/reference/skills/contract-testing" | relative_url }}) — Authoring générique de contrats
- [contract-fidelity-lens]({{ "/fr/reference/workers/contract-fidelity-lens" | relative_url }}) — Lentille conditionnelle qui audite la sortie de ce worker
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent DELIVER qui dispatche ce worker
