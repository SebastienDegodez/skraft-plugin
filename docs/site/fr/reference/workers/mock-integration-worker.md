---
layout: doc
lang: fr
title: "mock-integration-worker"
description: "[Internal worker — dispatched by software-engineer only] Resolves a mocking strategy (Microcks default, overridable to in-process) × stack and emits the downstream mock wiring plus an integration-test scaffold."
persona: software-engineer
---

# mock-integration-worker

> Worker interne dispatché par `software-engineer` pendant DELIVER : résout `(stratégie × stack)` et émet le câblage de mock aval + scaffold de test d'intégration — côté consommateur uniquement.

## Quand il s'active

Dispatché par `software-engineer` pendant la phase DELIVER quand un test d'intégration doit simuler une dépendance HTTP ou événement aval que le SUT appelle. Non invocable directement par l'utilisateur.

**Ce worker est côté consommateur** : il remplace ce que le SUT appelle. Il ne produit PAS de test de contrat fournisseur — c'est le rôle de [contract-testing-worker]({{ "/fr/reference/workers/contract-testing-worker" | relative_url }}).

## Entrées

**Requis :**
- Descripteur de dépendance aval (l'interface client que le SUT appelle)
- Intention de test d'intégration pour la slice active

**Contexte :**
- `.copilot-tracking/skraft-plans/{slug}/state.json` (`depthTier` + `difficulty`)
- Prompt d'exécution (peut porter une surcharge de stratégie/bibliothèque)
- `.github/instructions/skraft.instructions.md` — namespace `testing.mocking.*`

## Sortie

Bloc de résultat structuré retourné au lead — pas de commit :

```yaml
status: ok
capability: mocking
strategy: microcks | inprocess
stack: dotnet
library: fakeiteasy | nsubstitute | moq   # uniquement quand strategy == inprocess
files:
  - <chemins relatifs créés>
testCommand: <commande de test résolue>
notes: <une ligne — ce qui a été simulé et comment c'est câblé>
```

## Workflow

1. Charger [mocking-strategy-roster]({{ "/fr/reference/skills/mocking-strategy-roster" | relative_url }}) — résoudre `(stratégie × stack)` via la cascade (prompt > `skraft.instructions.md` `testing.mocking.*` > défaut `microcks`)
2. Sur blocker (stratégie/bibliothèque inconnue/stack non supporté) : retourner verbatim le payload `blocked` du roster
3. Charger l'adaptateur `mocking-{strategy}-{stack}` résolu et émettre le câblage mock + scaffold de test
4. Résoudre la commande de test via [resolving-stack-commands]({{ "/fr/reference/skills/resolving-stack-commands" | relative_url }})
5. Retourner le résultat structuré au lead

## Invariants

- **Simuler la dépendance aval, jamais le SUT lui-même** — double la dépendance aval à la frontière HTTP
- **Lire les surcharges par appel outil** — jamais depuis le rappel (S6 RULE BRIDGE)
- **Résoudre la commande de test** via `resolving-stack-commands` — ne jamais coder en dur (S7 DETERMINISTIC TOOL BRIDGE)
- **Pas de commit** — retourne un résultat structuré ; le lead commite
- **Pas de vérification de contrat fournisseur** — `VerifyAsync` est une capacité distincte (contract-testing)

## Pourquoi cette forme

Séparer le worker (câblage mock) du lead (TDD métier) maintient chaque responsabilité à son scope naturel. Le lead vérifie que le mock est appelé correctement dans la boucle TDD sans déléguer la décision de routage au worker.

> « Start with a failing test that describes the behaviour you want, guided by tests from the outside in. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

## Voir aussi

- [mocking-strategy-roster]({{ "/fr/reference/skills/mocking-strategy-roster" | relative_url }}) — Résout `(stratégie × stack)`
- [mocking-microcks-dotnet]({{ "/fr/reference/skills/mocking-microcks-dotnet" | relative_url }}) — Adaptateur par défaut appliqué par ce worker pour .NET
- [mocking-inprocess-dotnet]({{ "/fr/reference/skills/mocking-inprocess-dotnet" | relative_url }}) — Adaptateur en surcharge appliqué par ce worker pour .NET
- [mock-fidelity-lens]({{ "/fr/reference/workers/mock-fidelity-lens" | relative_url }}) — Lentille conditionnelle qui audite la sortie de ce worker
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent DELIVER qui dispatche ce worker
