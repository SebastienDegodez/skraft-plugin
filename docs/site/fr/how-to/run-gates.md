---
layout: doc
lang: fr
title: "Lancer les gates et lire leurs preuves"
description: "Lancer les gates des composants modifiés ou de tous les composants, lire la sortie, ouvrir le fichier de preuve et savoir quoi faire d'un échec environment ou deterministic."
persona: software-engineer
---

# Lancer les gates et lire leurs preuves

**But** : lancer les gates de vos composants, savoir pourquoi l'une échoue et qui doit agir.

Une **gate** est une commande nommée de `skraft-config.json` (`build`, `format`, `lint`, `test`, `architecture`, `coverage`, `mutation`) que le moteur lance lui-même. Chaque lancement laisse un **fichier de preuve** et une ligne `gate.ran` dans le journal du run.

Pendant un run, le moteur lance lui-même les gates en DELIVER : le nœud `gates`, puis le nœud `mutation`, tous deux verrouillés. `skraft gate` lance les mêmes commandes à la main, pour vérifier un composant avant ou après un run.

## Prérequis

- Un `skraft-config.json` avec au moins une gate par composant (voir [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }})).
- Un pipeline actif dans la copie de travail : `skraft init <slug>` (ou `/skraft <slug>` dans Claude Code). Sans lui, la commande est refusée avec `no-active-pipeline`.
- `skraft` désigne `node "<dossier du plugin>/engine/drivers/cli/skraft.mjs"`, où `<dossier du plugin>` est le dossier où l'hôte a installé le plugin skraft. Lancez-le depuis la racine de la copie de travail.

## 1. Lancer les gates des composants modifiés

```
skraft gate
```

Le moteur ne retient que les composants modifiés depuis leur base : commits, index, fichiers modifiés et fichiers non suivis. Il ignore `.copilot-tracking/` et les fichiers qui appartiennent à un composant imbriqué. Un composant sans base est toujours retenu.

Pour chaque composant retenu, les gates tournent dans l'ordre. Un composant s'arrête à sa première gate en échec ; les autres composants continuent.

Si rien n'a changé :

```
skraft checkout: gates passed — no component changed since its base; no gate to run
```

## 2. Lancer les gates de tous les composants

```
skraft gate --all
```

C'est la vérification de clôture : tous les composants, modifiés ou non.

## 3. Lire la sortie

Une ligne par gate lancée, puis un résumé :

```
pass  web/build
pass  web/lint
fail (deterministic)  web/test: exited 1
pass  api/build
fail (deterministic)  api/test: exited 1
skraft checkout: gates failed — web/test: exited 1; api/test: exited 1
```

Code de sortie : 0 si `passed`, 1 sinon. Un refus s'affiche avec son code entre parenthèses :

```
skraft checkout: gates refused (no-components) — skraft-config.json lists no component; run skraft init to detect them
```

Pour un outil ou un script, `--json` rend tout le résultat : `status`, `scope`, `components`, `failure`, `code`, `reason` et, pour chaque gate, `component`, `gate`, `status`, `failure`, `reason`, `evidence`.

```
skraft gate --all --json
```

## 4. Ouvrir le fichier de preuve

Chaque gate lancée écrit :

```
.copilot-tracking/skraft-plans/<slug>/gates/<composant>/<gate>-<n>.log
```

`<n>` augmente à chaque nouveau lancement de la même gate : la preuve précédente reste. Le champ `evidence` de `--json` donne le chemin complet.

Contenu :

```
$ npm test
cwd: ../payment-web
result: fail (deterministic): exited 1
--- stdout
…
--- stderr
…
```

La ligne `result:` dit le verdict et la raison. `stdout` et `stderr` sont ceux de la commande, sans retouche. Quand rien n'a été lancé (ligne refusée, `{baseSha}` sans base), le fichier s'arrête après `result:`. Quand le programme n'a pas pu démarrer (introuvable), les sections `--- stdout` et `--- stderr` sont présentes et vides.

## 5. Distinguer environment et deterministic

| Classe | Ce qui s'est passé | Qui agit | Quoi faire |
|---|---|---|---|
| `environment` | Programme introuvable (ou code 127 / 9009), syntaxe shell, composant sans gate, programme arrêté | Un humain, sur la machine ou dans la config | Installer l'outil, corriger la commande, puis relancer |
| `deterministic` | La commande a tourné et a rendu un code non nul | Le code | Lire `stderr` dans la preuve, corriger le code ou le test, relancer |

Un échec `environment` ne dit rien de votre code : relancer sans rien changer donne le même échec. Un échec `deterministic` ne se corrige pas en changeant de machine.

Quand les gates tournent comme étape du pipeline, un échec `environment` n'arrête pas le run : le moteur demande `<node> cannot run on this machine: <reason>. Fix it, then RETRY; or ABORT the run.` Réparez la machine, puis répondez `RETRY` (voir [Reprendre ou débloquer un run]({{ "/fr/how-to/resume-a-run" | relative_url }})).

Raisons `environment` que vous verrez :

| Raison | Action |
|---|---|
| `command not found: dotnet; install it or change the command in skraft-config.json` | Installer le programme ou écrire une commande qui marche chez vous. |
| `npx was stopped by SIGKILL; run it again` | Le programme a été arrêté (mémoire, interruption). Relancer. |
| `no gate command; give it at least one of build, format, lint, test, architecture, coverage, mutation in skraft-config.json` | Ajouter au moins une gate au composant. |
| `command "dotnet stryker --since:{baseSha}" uses {baseSha} but the run has no base for this repository` | Placer la racine du composant dans un dépôt Git, ou retirer `{baseSha}`. |

## 6. Cas Docker et Microcks

Un composant en Microcks (le défaut) fait tourner Microcks dans un conteneur, Docker ou Podman, pendant les tests qui l'utilisent. Le moteur ne vérifie pas sa présence : les gates tournent, et un test qui a besoin d'un conteneur absent échoue comme tout test en échec. Pendant un run, l'agent software-engineer s'arrête alors en blocage et vous demande de démarrer Docker ou Podman ; le run reprend et relance les tests.

Deux sorties :

1. Démarrer Docker ou Podman, puis `skraft gate`.
2. Passer le composant en `"mocking": { "strategy": "inprocess" }`. Lisez d'abord les risques dans [Personnaliser SKRAFT]({{ "/fr/how-to/customisation" | relative_url }}).

## 7. Syntaxe shell refusée : écrire un script

Le moteur lance les commandes sans shell. Une commande avec `|`, `&`, `;`, `<` ou `>` hors guillemets n'est pas lancée :

```
fail (environment)  web/test: command "npm ci && npx vitest run" uses shell syntax (&&); put the steps in a script and call the script
```

Mettez les étapes dans un script, puis appelez-le. Par exemple, dans `package.json` :

```json
"scripts": { "test:ci": "npm ci && vitest run" }
```

et dans `skraft-config.json` : `"test": "npm run test:ci"`. Un script Node (`node scripts/ci-test.mjs`) marche aussi sous Windows et macOS.

Un guillemet non fermé est refusé de la même façon : `has an unclosed " quote`.

## 8. Windows : les commandes `.cmd`

Écrivez `npm test`, `npx vitest run` ou `gradlew.bat test`, pas `npm.cmd`. Le moteur trouve le programme avec PATHEXT, puis lance un `.cmd` ou un `.bat` par cmd.exe en échappant les arguments. La même ligne marche sous macOS, Linux et Windows.

Pour vérifier qu'un programme est trouvé avant de lancer les gates : `skraft doctor`.

## Voir aussi

- [Référence de la ligne de commande]({{ "/fr/reference/cli" | relative_url }})
- [Référence du journal]({{ "/fr/reference/run-journal" | relative_url }}) — l'événement `gate.ran`.
- [Reprendre ou débloquer un run]({{ "/fr/how-to/resume-a-run" | relative_url }})
