---
title: "Lancer les gates et lire leurs preuves"
description: "Comment l'ingénieur lance chaque gate par skraft_repl, en déclare une absente, et ce que le moteur contrôle et refuse à la soumission d'une tentative."
persona: software-engineer
---

# Lancer les gates et lire leurs preuves

Le moteur ne lance aucune gate. Dans DELIVER, l'ingénieur logiciel lance toutes les gates de chaque
composant que l'histoire a modifié par l'outil MCP `skraft_repl`, et le moteur lit la trace signée de
ces exécutions à la soumission de la tentative. Cette page montre ce que cela demande à l'ingénieur
et comment lire un refus.

## Prérequis

- Un `skraft-config.json` avec les commandes de chaque composant
  ([Configurer les composants](./configure-components.md)) ; `skraft doctor` les liste, il n'en lance aucune.
- Un pipeline actif : `skraft init <slug>` ou `/skraft <slug>` (sinon refus
  `no-active-pipeline`).

## 1. Lancer chaque gate par le REPL

Pour chaque composant que l'histoire a modifié, l'ingénieur lance les six gates, dans des cellules de
`skraft_repl` ([Le REPL](../reference/repl.md)) :

```js
await gate('build', 'dotnet build --nologo', { cwd: 'api' })
await gate('format', 'dotnet format --verify-no-changes', { cwd: 'api' })
await gate('lint', 'dotnet build -warnaserror', { cwd: 'api' })
await gate('architecture', 'dotnet test api/Architecture.Tests', { cwd: 'api' })
await gate('coverage', 'node scripts/coverage.mjs', { cwd: 'api' })
```

La gate `test` est l'exécution de la ligne de commit : toute la suite de tests non filtrée, enchaînée à
`git add` et `git commit`, étiquette `green`. Cette exécution est l'exécution `test` ; l'ingénieur ne
relance pas `test` une seconde fois. La commande de chaque gate est celle que `skraft-config.json`
donne au composant.

## 2. Déclarer une gate absente

Une gate dont les documents du projet ne nomment aucune commande se déclare, avec sa raison :

```js
absent('architecture', 'api', 'le projet n\'a aucune règle de dépendance à vérifier')
```

`test` n'est jamais absente. Une gate déclarée absente n'a besoin d'aucune exécution.

## 3. Ce que le moteur contrôle

À la soumission de la tentative, le moteur lit `logs/runs/<step>-<visit>-<attempt>/runs.jsonl`. Pour
chaque composant que l'histoire a modifié, il tient chaque gate à la même règle : la dernière
exécution de la gate sous le dossier du composant est sortie avec 0, a démarré sur un arbre propre
(hors l'exécution de la ligne de commit) et s'est terminée sur le dernier commit ; ou la gate a été
déclarée absente. Des exécutions ouvertes, une trace non signée ou modifiée et une clé manquante
refusent aussi la tentative. Quand la règle tient, le journal enregistre `evidence.checked` avec les
exécutions sur lesquelles elle s'appuie, et les rapports les montrent sous « Preuves de qualité »
([Gates](../reference/gates.md#command-gates)).

## 4. Lire un refus `evidence`

Une tentative refusée échoue avec le code `evidence`, une ligne fixe par gate, sans sortie ni
commande. L'ingénieur relance la gate par le REPL, sur un arbre propre, puis commite ; le log de chaque
exécution est sous `logs/runs/<step>-<visit>-<attempt>/`.

| Cause derrière une ligne | Ce que fait l'ingénieur |
| --- | --- |
| la gate n'a jamais tourné dans ce composant | la lancer avec `gate(name, command, { cwd })` |
| sa dernière exécution est sortie non nulle | corriger le code ou le test d'après le log de l'exécution, relancer |
| elle a démarré sur un arbre modifié | commiter ou annuler le changement, relancer |
| elle s'est terminée sur un commit antérieur au dernier | relancer après le dernier commit |
| une exécution est restée ouverte | l'attendre, ou relancer la gate |
| la trace n'est pas signée ou a été modifiée | recommencer la tentative ; une trace ne se répare jamais à la main |

## Dépannage

| Raison | Action |
| --- | --- |
| Un programme est introuvable | L'installer, ou changer la commande dans `skraft-config.json` ; `skraft doctor` liste les commandes de chaque composant. |
| Un test qui a besoin de Microcks échoue faute de conteneur | Démarrer Docker ou Podman, puis relancer la gate ; ou passer le composant à `"mocking": { "strategy": "inprocess" }` ([ce à quoi vous renoncez](../explanation/customisation-trade-offs.md)). |
| Une gate n'a pas de commande | L'ajouter au composant, ou la déclarer avec `absent`. |

## Étapes suivantes <!-- #next-steps -->

- [Gates](../reference/gates.md) : les gates, les règles de preuve, les critères de revue.
- [Le REPL](../reference/repl.md) : `gate`, `absent`, la trace.
- [Dossier de suivi et journal](../reference/run-journal.md#gate-evidence) : l'événement `evidence.checked`.
