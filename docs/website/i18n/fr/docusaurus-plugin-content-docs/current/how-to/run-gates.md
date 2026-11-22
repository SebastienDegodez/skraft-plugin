---
title: "Lancer les gates et lire leurs preuves"
description: "Comment l'ingénieur lance chaque gate par skraft_repl, en déclare une absente, et comment lire les constats de la lentille quality-gates."
persona: software-engineer
---

# Lancer les gates et lire leurs preuves

Le moteur ne lance aucune gate. Dans DELIVER, l'ingénieur logiciel lance toutes les gates de chaque
composant que l'histoire a modifié par l'outil MCP `skraft_repl`, et la lentille `quality-gates` de la revue
DELIVER lit la trace signée de ces exécutions. Cette page montre ce que cela demande à l'ingénieur
et comment lire les constats de la lentille.

## Prérequis

- Un `skraft-config.json` avec les commandes de chaque composant
  ([Configurer les composants](./configure-components.md)) ; `skraft doctor` les liste, il n'en lance aucune.
- Un pipeline actif : `skraft init <slug>` ou `/skraft <slug>` (sinon refus
  `no-active-pipeline`).

## 1. Lancer chaque gate par le REPL

Pour chaque composant que l'histoire a modifié, l'ingénieur lance `build`, `format`, `lint` et
`architecture` dans une cellule de `skraft_repl` ([Le REPL](../reference/repl.md)), avant la ligne de
commit, qui termine la dernière de ces cellules ; chaque gate passe avant elle, et aucun commit
`style` n'en rattrape une. `coverage`, puis `e2e`, tournent après, sur ce commit et un arbre propre :

```js
await gate('build', 'dotnet build --nologo', { cwd: 'api' })
await gate('format', 'dotnet format --verify-no-changes', { cwd: 'api' })
await gate('lint', 'dotnet build -warnaserror', { cwd: 'api' })
await gate('architecture', 'dotnet test api/Architecture.Tests', { cwd: 'api' })
await run(commitLine, { gate: 'test', label: 'green' })
```

```js
await gate('coverage', 'node scripts/coverage.mjs', { cwd: 'api' })
```

Une cellule qui ne s'arrête pas, ou un noyau auquel l'ingénieur ne se fie plus : `skraft_repl_reset`
arrête le noyau et ses runs, puis le `skraft_repl` suivant en démarre un neuf, aux variables perdues.

La gate `test` est l'exécution de la ligne de commit : toute la suite de tests non filtrée, enchaînée à
`git add` et `git commit`, étiquette `green`. Cette exécution est l'exécution `test` ; l'ingénieur ne
relance pas `test` une seconde fois. La commande de chaque gate est celle que `skraft-config.json`
donne au composant.

## 2. Déclarer une gate absente

Une gate dont le composant ne nomme aucune commande dans `skraft-config.json` se déclare, avec sa
raison. Le brief de DELIVER donne l'appel exact sur la ligne de la gate, pour `build`, `format`,
`lint`, `architecture` et `coverage` :

```text
- api: coverage: no command → absent('coverage', 'api', 'no command in skraft-config.json')
```

L'ingénieur fait cet appel dans sa cellule au lieu de sauter la gate :

```js
absent('coverage', 'api', 'no command in skraft-config.json')
```

`test` n'est jamais absente, et `e2e` n'est une gate que quand le composant nomme sa commande. Une
gate déclarée absente n'a besoin d'aucune exécution.

## 3. Ce que le moteur fait de la trace

Le moteur ne refuse aucune tentative pour ces exécutions. Il lit
`logs/runs/<step>-<visit>-<attempt>/runs.jsonl` et, quand la trace se lit jusqu'à ses signatures,
journalise `evidence.checked` avec les exécutions de la tentative. Il remet la trace à la revue DELIVER.
Les rapports montrent les exécutions sous « Preuves de qualité » ([Gates](../reference/gates.md#command-gates)).

## 4. Lire les constats de `quality-gates`

La lentille signale, par composant touché et par gate, une exécution qu'elle ne peut pas accepter.
L'ingénieur relance les gates par le REPL, dans la cellule que termine la ligne de commit ; le log de chaque
exécution est sous `logs/runs/<step>-<visit>-<attempt>/`.

| Constat | Ce que fait l'ingénieur |
| --- | --- |
| une exécution manque : pas de ligne de run, un démarrage sans run, un run perdu | lancer la gate avec `gate(name, command, { cwd })` |
| une exécution n'a pas réussi : tuée, délai dépassé, sortie non nulle | corriger le code ou le test d'après le log de l'exécution, relancer |
| la dernière exécution n'est pas sur le dernier commit, ni lancée avant la ligne de commit qui l'a fait | relancer la cellule |
| elle a démarré sur un arbre modifié (hors les exécutions avant la ligne de commit, et la sienne) | commiter ou annuler le changement, relancer |

Une gate déclarée `absent` avec une raison est acceptée, jamais `test`. Sur une pull request relue hors
d'un run, la lentille n'a pas de trace et passe.

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
