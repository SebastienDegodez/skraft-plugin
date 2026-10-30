---
layout: doc
lang: fr
title: "Premier run sous GitHub Copilot CLI"
description: "Installer SKRAFT dans GitHub Copilot CLI, lancer une story avec l'agent orchestrateur, répondre à ses questions dans le chat et suivre le run jusqu'à PUBLISH."
persona: software-engineer
---

# Premier run sous GitHub Copilot CLI

> Dans ce tutoriel, vous installez SKRAFT dans GitHub Copilot CLI, lancez la story « #42 Pay by
> card » sur un petit dépôt, répondez à ses questions dans le chat, et suivez le run jusqu'au
> bout. À la fin, le journal du workflow dit `checkout: done: PUBLISH closed` et `skraft report`
> montre chaque étape du run.

Un seul parcours, du début à la fin ; chaque étape dit ce que vous devez voir. Le run lance de
vrais agents : comptez du temps et les crédits Copilot qu'ils consomment.

## Ce dont vous avez besoin

- **Node 22** ou plus, et npm ;
- **Git** ;
- **GitHub Copilot CLI**, connecté à votre compte.

## 1. Créer le petit dépôt

Dans un terminal, créez le dossier `shop` et ses fichiers :

```text
mkdir shop
cd shop
git init -b main
```

`web/package.json` :

```json
{
  "name": "web",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

`web/src/cart.js` :

```js
export const total = (prices) => prices.reduce((sum, price) => sum + price, 0)
```

`web/test/cart.test.js` :

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { total } from '../src/cart.js'

test('the total of a cart adds its prices', () => {
  assert.equal(total([2, 3]), 5)
})
```

`web/stryker.config.json`, pour la gate de mutation :

```json
{
  "testRunner": "tap",
  "mutate": ["src/**/*.js"],
  "tap": { "testFiles": ["test/**/*.test.js"], "nodeArgs": ["--test-reporter=tap"] }
}
```

Créez un `.gitignore` à la racine qui contient deux lignes, `node_modules/` et `reports/`. Installez
StrykerJS, puis commitez sur une branche à vous :

```text
npm install --save-dev --prefix web @stryker-mutator/core@9.6.1 @stryker-mutator/tap-runner@9.6.1
git add .
git commit -m "Start the shop"
git switch -c pay-by-card
```

`git status` ne montre plus rien à commiter.

## 2. Installer le plugin

Toujours dans le terminal :

```text
copilot plugin marketplace add SebastienDegodez/skraft-plugin
copilot plugin install skraft@skraft
copilot plugin list
```

`skraft` figure dans la liste.

## 3. Décrire le dépôt

La ligne de commande `skraft` est un script Node livré avec le plugin. Depuis la racine de `shop`,
avec `<dossier du plugin skraft>` le dossier où Copilot a installé le plugin :

```text
node "<dossier du plugin skraft>/engine/drivers/cli/skraft.mjs" init
```

Dans la suite, `skraft …` veut dire cette commande complète. Vous voyez :

![Terminal : skraft init répond « skraft-config.json: web (javascript, web) »]({{ "/assets/screenshots/shared/terminal-init.svg" | relative_url }})

*Figure 1 — Un composant, `web`, avec ses commandes `test` et `mutation`, est écrit dans
`skraft-config.json`.*

Commitez la configuration, puis vérifiez la machine :

```text
git add skraft-config.json .gitignore
git commit -m "chore: describe the shop for skraft"
skraft doctor
```

La dernière ligne de `skraft doctor` dit `no check failed, 3 with a warning`. Aucun des
avertissements ne bloque : `forge` dit que le dépôt n'a pas encore de remote, `web` n'a pas de recette de mocking JavaScript, et le petit dépôt
n'appelle aucun service ; `models/copilot` dit que, sans modèle configuré, chaque agent tourne sur le
modèle de votre session.

## 4. Lancer la story

Ouvrez une session Copilot dans `shop` :

```text
copilot
```

Tapez `/agent`, choisissez `skraft:skraft-orchestrator`, puis écrivez :

```text
Lance le pipeline checkout pour l'issue 42, titre « Pay by card ».
```

L'agent lance le workflow dynamique `skraft-pipeline` avec `{ slug: "checkout", issue: 42, title:
"Pay by card" }`. Le dépôt n'a pas de remote : le run démarre quand même, ses agents n'ont que le
numéro et le titre de l'issue.

Avant toute phase, au premier run d'une copie de travail, Copilot pose une fois dans le chat :
*Démarrer ce run avec la configuration de cette copie de travail ?* Si votre client affiche les
canvases, le canvas `skraft-pipeline` s'ouvre sur son onglet **Configuration** : la forge, les
composants et leurs commandes, les consentements, le modèle de chaque agent et la barre de
qualité. Modifiez ce qu'il faut et enregistrez, puis répondez **START**. START est gardé dans
`skraft-config.local.json`, si bien que les runs suivants démarrent sans demander ; STOP ne démarre
rien. Passez `configure: true` au workflow pour qu'on vous le redemande. Le canvas a aussi un onglet
**Run** (où en est le run) et un onglet **Workflow** (chaque workflow que le run peut suivre,
l'étape en cours mise en évidence).

## 5. Répondre à la première question

Copilot vous pose une question dans le chat, une seule fois : skraft peut-il pousser la branche et
ouvrir la pull request à la fin du run ? Si votre client Copilot affiche les canvas, demandez-lui
d'ouvrir le canvas `skraft-pipeline` : il montre la même question et le workflow.

![Canvas skraft-pipeline : statut WAITING, bouton « On a besoin de vous » dans l'en-tête, encadré « Pull request » avec la question et la façon d'y répondre, RESEARCH ouverte sur publish_consent, les autres phases à venir]({{ "/assets/screenshots/shared/pipeline-canvas-question.png" | relative_url }})

*Figure 2 — Le canvas `skraft-pipeline` du dépôt `shop` : le run attend la réponse à
`publish_consent-1`. Le canvas montre ; c'est dans le chat que vous répondez.*

Choisissez **DECLINED** : ce dépôt n'a pas de remote. La réponse est écrite dans
`skraft-config.json` et ne sera plus redemandée.

## 6. Suivre RESEARCH et DESIGN

Tapez `/workflows` pour voir le journal du run. Chaque agent y apparaît avec sa famille de modèle :

```text
checkout: solution-researcher, attempt 1 — researcher · standard · model chosen by the host
```

Quand l'architecte propose un ADR et que les trois lentilles de la revue de conception l'ont
approuvé, Copilot vous pose la question suivante : ratifier l'ADR. Le canvas la montre aussi :

![Canvas skraft-pipeline : statut WAITING avec un bouton « On a besoin de vous » sur la question ADR adr-1, RESEARCH cochée, DESIGN ouverte avec design et design_review faits, adr en cours ; sous le workflow, la revue design_review approuvée et le modèle de chaque agent]({{ "/assets/screenshots/shared/pipeline-canvas-adr.png" | relative_url }})

*Figure 3 — Le run attend la ratification de l'ADR. Capture faite sur le dépôt scripté des tests
d'intégration, dont l'ADR s'appelle `adr-001-card-payment.md` ; le vôtre porte le titre que
l'architecte lui a donné.*

Ouvrez l'ADR sous `docs/adr/`, lisez-le, puis choisissez **RATIFIED** dans le chat. Le moteur le
passe `Accepted` et le commite : `docs(adr): ratify ADR-001`.

## 7. Laisser finir DISTILL, DELIVER et PUBLISH

Le run continue sans vous : tests d'acceptation, cycles TDD, gates, revue DELIVER, mutation, puis
la description de la pull request. Le journal de `/workflows` se termine ainsi :

![Journal du workflow skraft-pipeline : phase PUBLISH, pr-writer, la pull request non ouverte car publish.pullRequest vaut false, PUBLISH closed, puis checkout: done: PUBLISH closed]({{ "/assets/screenshots/shared/terminal-workflow-log.svg" | relative_url }})

*Figure 4 — La fin du journal : la description est écrite dans `pull-request.md`, rien n'est
poussé, le run est fini.*

Le canvas coche alors chaque phase :

![Canvas skraft-pipeline : statut DONE, « PUBLISH closed », RESEARCH à PUBLISH cochées avec chaque étape et son résultat, puis les revues approuvées et les gates passées]({{ "/assets/screenshots/shared/pipeline-canvas-done.png" | relative_url }})

*Figure 5 — Un run terminé dans le canvas (dépôt scripté des tests d'intégration). Les étapes
`kill_proposal` à `mutation_gates` restent grises : aucun mutant n'a survécu.*

## 8. Lire le rapport du run

Dans le terminal, à la racine de `shop` :

```text
skraft report
```

![Terminal : skraft report, un tableau d'une ligne par étape avec ses visites, tentatives, relances, temps, coût et résultat, une ligne Total, puis la question adr-1 répondue RATIFIED par host-confirmed]({{ "/assets/screenshots/shared/terminal-report-done.svg" | relative_url }})

*Figure 6 — Le rapport d'un run terminé. Sur le dépôt scripté, les agents répondent aussitôt, d'où
des temps nuls ; sous Copilot, la colonne Coût reste vide : Copilot compte en crédits.*

La dernière table dit qui a répondu : `host-confirmed`, c'est-à-dire vous, dans la boîte de
dialogue de Copilot. Ouvrez enfin `.copilot-tracking/skraft-plans/checkout/pull-request.md` : c'est
la description de la pull request que votre run a produite.

## Ce que vous avez appris

- sous Copilot CLI, l'agent `skraft:skraft-orchestrator` lance le workflow `skraft-pipeline`, et le
  moteur conduit chaque phase ;
- chaque décision vous est posée une seule fois, dans le chat ; votre réponse est journalisée
  `host-confirmed` ;
- `/workflows` montre le journal du run, et le canvas `skraft-pipeline` le workflow et la question en
  attente, sans jamais prendre de réponse ;
- `skraft report` relit le run depuis le journal : chaque étape, ses passages et ses réponses.

## Pages suivantes

- [Répondre à une question du run]({{ "/fr/how-to/answer-a-question" | relative_url }}) — quand la question n'a pas pu être posée, ou que vous l'avez fermée.
- [Reprendre un run]({{ "/fr/how-to/resume-a-run" | relative_url }})
- [Choisir les modèles des agents]({{ "/fr/how-to/choose-models" | relative_url }}) — pour faire disparaître l'avertissement `models/copilot`.
- [Hôtes]({{ "/fr/reference/hosts" | relative_url }}#copilot-cli) — le workflow, le canvas et l'outil `skraft_decide`.
- [Premiers pas]({{ "/fr/tutorials/getting-started" | relative_url }}) — le même parcours sous Claude Code.
