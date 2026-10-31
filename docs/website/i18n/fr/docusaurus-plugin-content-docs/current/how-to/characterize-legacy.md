---
title: "Poser un filet de caractérisation sur un service existant"
description: "Faire écrire par brownfield-harness-builder le contrat d'un service HTTP existant et des tests de caractérisation qui figent son comportement actuel, puis lire le verdict PASS, CONCERNS ou FAIL avant tout refactoring."
persona: software-engineer
---

# Poser un filet de caractérisation sur un service existant

**But** : rendre un service HTTP existant sûr à modifier, avec des tests qui figent ce qu'il fait
aujourd'hui, bugs compris.

Pour comprendre la méthode : [Parcours Brownfield](../explanation/brownfield.md)
et [Feathers, 2004](../reference/citations.mdx#cite-feathers-legacy-2004).

## Prérequis

- Les plugins `skraft` **et** `skraft-brownfield` installés : le second reprend par leur nom les
  skills `contract-testing` et `mocking-strategy-roster` du premier
  ([Installer skraft sur un hôte](./install-on-a-host.mdx)).
- Un service HTTP .NET, Java, Python ou Node/TypeScript qui compile, et sa commande de test.
- Conseillé : un `skraft-config.json` qui décrit le composant (`skraft init`) ; ses commandes
  `build` et `test` et son réglage `mocking` priment alors sur la détection
  ([Configurer les composants](./configure-components.md)).
- Une branche de travail propre : l'agent écrit et commite des fichiers de test.

## 1. Lancer l'agent sur le service

| Hôte | Comment |
|---|---|
| Claude Code | demandez dans la conversation : *« Utilise l'agent skraft-brownfield:brownfield-harness-builder pour poser un filet de caractérisation sur `services/orders` »* |
| Copilot CLI, VS Code | choisissez l'agent **Skraft - Brownfield Harness Builder** (`/agent` dans Copilot CLI, le sélecteur d'agent dans VS Code), puis nommez le service |

Nommez le composant tel qu'il figure dans `skraft-config.json`, ou son dossier. Sans cible,
l'agent vous la demande.

## 2. Laisser établir le contrat

L'agent cherche d'abord un document OpenAPI ou AsyncAPI existant ; à défaut il le génère avec
l'outillage du framework (Swashbuckle ou NSwag, springdoc, FastAPI, NestJS Swagger) ; à défaut
encore il le reconstruit depuis les routes du code et marque chaque opération reconstruite
`confidence: Medium` ou `Low`. Le contrat est commité sous les chemins de test du composant.

Si le dépôt a déjà un contrat ailleurs, donnez son chemin dès l'étape 1.

## 3. Laisser écrire les tests de caractérisation

Un test par opération du contrat et par famille de réponses, à travers l'hôte de test en
processus du framework, chaque dépendance aval mockée selon le réglage `mocking` du composant
(Microcks ou en processus). Un comportement qui semble faux est affirmé tel quel, avec le
commentaire :

```text
CHARACTERIZATION: current behaviour may be unintended — <quoi et pourquoi>
```

L'agent ne touche jamais au code du service, même pour faire passer un test.

## 4. Lire le verdict

L'agent lance la commande `test` du composant sur le code **non modifié** et rend :

| Verdict | Signification | Action |
|---|---|---|
| `PASS` | tout est vert et chaque opération du contrat a son test | passer au refactoring |
| `CONCERNS` | tout est vert, avec des trous nommés (opération à faible confiance, dépendance mal mockée) | pour chaque trou, renforcer le filet ou accepter le risque, en le disant à l'agent |
| `FAIL` | un test échoue sur le code non modifié, ou aucun contrat n'a pu être établi | le harnais est faux : le faire corriger, jamais le service |

Le rapport final donne l'origine et le chemin du contrat, la commande de test lancée et son
résultat, le verdict, les trous et les bugs suspectés.

## 5. Commiter le filet

Relisez les tests marqués `CHARACTERIZATION:` : chacun documente un bug possible. Gardez-les tels
quels jusqu'à ce qu'une story change ce comportement exprès. Le filet reste dans la suite de tests
et tourne avec les gates de chaque run skraft.

## Dépannage

| Situation | Action |
|---|---|
| `[SKILL MISSING] contract-testing` (ou `mocking-strategy-roster`) | Installer le plugin `skraft` à côté de `skraft-brownfield`, puis relancer. |
| `{"status": "blocked", "summary": …}` | L'agent tournait sans personne pour répondre : relancer en session interactive, ou fournir ce que `summary` nomme. |
| Une dépendance aval refuse d'être mockée | Verdict `CONCERNS` : accepter le trou, ou changer `mocking` du composant ([Configurer les composants](./configure-components.md)). |
| Pas de skill de contract testing pour la stack | L'agent prend l'hôte de test standard du framework et le dit dans son rapport. |

## Voir aussi

- [Refactorer un code existant sous filet](./refactor-legacy.md) — l'étape suivante.
- [Parcours Brownfield](../explanation/brownfield.md)
- [Le catalogue des agents et skills](pathname:///dashboard/#agent-brownfield-harness-builder)
