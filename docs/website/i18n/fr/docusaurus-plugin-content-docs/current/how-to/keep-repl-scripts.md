---
title: "Garder vos scripts REPL dans .repl"
description: "Écrire dans .repl/lib des outils que chaque cellule du REPL trouve, installer leurs paquets, les recharger, garder un script d'agent."
persona: software-engineer
---

# Garder vos scripts REPL dans `.repl`

Quand les agents d'un run compilent, testent ou vérifient votre code, ils le font dans un REPL
JavaScript, une cellule à la fois. Cette page montre comment leur donner vos propres outils, écrits
une fois dans votre dépôt et présents dans chaque cellule : un lanceur de tests filtré sur un
scénario, un coup d'œil à une page dans un navigateur, tout ce que votre projet répète.

## Ce qu'est le REPL

`skraft_repl` est l'outil par lequel le concepteur des tests d'acceptation et l'ingénieur logiciel
lancent les commandes de votre projet. Chaque appel envoie une cellule de JavaScript à un processus
Node gardé pour la tentative (le noyau) : les variables restent d'une cellule à l'autre, et une
cellule lance un programme par `run()`, ou une gate par `gate()`. Le moteur note chaque programme
qu'il a lancé, signé, dans le dossier de la tentative. `skraft_repl_reset` termine ce noyau et ses
programmes ; la cellule suivante en démarre un neuf. Le détail est dans
[Le REPL](../reference/repl.md).

## Ce qu'il vous faut

- skraft initialisé dans la copie de travail (`skraft init`) : il inscrit `.repl/node_modules/`
  dans votre `.gitignore`.
- Node 22 ou plus récent sur la machine, celle où tourne le REPL.

## 1. Écrire un outil dans `.repl/lib`

Chaque fichier `.repl/lib/<nom>.mjs` est un module que le noyau importe à son démarrage. Ses exports
nommés arrivent dans chaque cellule sous `lib.<nom>`. Un module tourne dans le noyau, il peut donc
appeler `run` et `gate` comme une cellule.

Un lanceur de tests filtré sur un nom, `.repl/lib/tests.mjs` :

```js
// lib.tests.only('Checkout') lance les tests dont le nom contient Checkout, et eux seuls.
export const only = (name, { cwd = 'api' } = {}) =>
  run(['dotnet', 'test', '--nologo', '--filter', `FullyQualifiedName~${name}`], { cwd, label: `only ${name}`, timeout: 900 })
```

Une cellule s'écrit alors :

```js
const result = await lib.tests.only('Checkout')
result.exitCode
```

Un nom de fichier doit être un identifiant JavaScript : `tests.mjs` et `e2eHelpers.mjs` se chargent,
`e2e-helpers.mjs` non, et le premier résultat du noyau le nomme. Un module qui lève une erreur à son
chargement, ou met plus de dix secondes, est laissé de côté, et le noyau continue sans lui. Le
premier résultat dit aussi ce qu'il a chargé : `lib: browser, tests`.

## 2. Déclarer les paquets des outils

Un outil peut importer des paquets. Déclarez-les dans `.repl/package.json`, installez-les, et
commitez le manifeste et son fichier de verrouillage :

```sh
npm install --prefix .repl playwright@1.49.1
git add .repl/package.json .repl/package-lock.json .repl/lib
```

Sur une autre machine, ou en CI, `npm ci --prefix .repl` installe les mêmes versions.
`.repl/node_modules/` n'est jamais commité. Quand `.repl/package.json` nomme des paquets et que
`.repl/node_modules/` est absent, le premier résultat du noyau le dit et nomme cette commande.

Un outil Playwright, `.repl/lib/browser.mjs`, qui lance les tests de bout en bout d'un scénario et
ouvre une page pour lire son titre et ses erreurs de console :

```js
import { chromium } from 'playwright'

// lib.browser.scenario('S2') lance les tests Playwright dont le titre contient S2.
export const scenario = (title, { cwd = 'web' } = {}) =>
  run(['npx', 'playwright', 'test', '--grep', title, '--reporter=line'], { cwd, label: `e2e ${title}`, timeout: 900 })

// lib.browser.peek('http://localhost:5173/cart') dit ce que la page montre et les erreurs qu'elle a écrites.
export const peek = async (url) => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    await page.goto(url)
    return { title: await page.title(), errors }
  } finally {
    await browser.close()
  }
}
```

Les navigateurs que pilote Playwright s'installent une fois par machine :
`npm exec --prefix .repl -- playwright install chromium`.

## 3. Garder une gate une gate

Une gate ne compte que comme un programme que le serveur a lancé et tracé. Lancez la commande de la
gate par `gate()`, depuis une cellule ou depuis un outil :

```js
// .repl/lib/gates.mjs
export const e2e = () => gate('e2e', 'npx playwright test', { cwd: 'web', timeout: 1800 })
```

Un run filtré, comme `lib.tests.only(…)`, n'est pas une gate : il aide l'agent à travailler, et la
gate complète doit encore tourner. Importer un script de gate dans une cellule et appeler sa
fonction ne prouve rien non plus : aucun run n'est tracé. Lancez-le par
`gate(name, ['node', '<chemin du script>', …])`.

## 4. Recharger la bibliothèque

Le noyau importe `.repl/lib` à son démarrage, et seulement là. Après avoir modifié un outil, faites
appeler `skraft_repl_reset` à l'agent : la cellule suivante démarre un noyau qui importe votre
nouvelle version. Les variables du noyau précédent sont perdues ; les numéros de runs continuent.

## 5. Garder un script écrit par un agent

La bibliothèque est à vous. Les agents s'en servent et ne l'écrivent jamais pendant une tentative :
un agent qui veut un outil l'écrit dans une cellule. Le code de chaque cellule est gardé dans le
dossier de la tentative, à côté de la trace de ses runs :

```text
.copilot-tracking/skraft-plans/<slug>/logs/runs/<étape>-<visite>-<tentative>/
  runs.jsonl     la trace signée des runs
  cell-1.mjs     le code de la première cellule
  cell-2.mjs
  cell-2.log     la sortie de la cellule 2, quand son résultat a été coupé
  1.log          ce que le run 1 a affiché
```

Les numéros de cellules continuent après un reset, aucun fichier n'est donc réécrit. Ces fichiers
ne sont pas commités, et skraft ne les supprime jamais. Pour garder un script qui vous a plu,
copiez-le dans la bibliothèque, faites-en une fonction exportée, et commitez-le :

```sh
cp .copilot-tracking/skraft-plans/checkout/logs/runs/deliver-1-2/cell-4.mjs .repl/lib/seed.mjs
```

## Dépannage

| Le premier résultat dit | Faire |
| --- | --- |
| `lib: <nom>.mjs is not loaded: the name of a module must be a JavaScript identifier` | renommer le fichier : lettres, chiffres, `_` ou `$`, sans commencer par un chiffre |
| `lib: <nom> could not be loaded` | lancer `node .repl/lib/<nom>.mjs` pour voir l'erreur levée au chargement, la corriger, puis `skraft_repl_reset` |
| que `.repl/node_modules` manque | `npm ci --prefix .repl` |
| rien d'un outil que vous venez de modifier | le noyau a démarré avant la modification : `skraft_repl_reset` |
