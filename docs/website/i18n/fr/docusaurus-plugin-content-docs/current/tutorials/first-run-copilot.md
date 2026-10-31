---
title: "Premier run sous GitHub Copilot CLI"
description: "Installer SKRAFT dans GitHub Copilot CLI, lancer une story avec l'agent orchestrateur, répondre à ses questions dans le chat et suivre le run jusqu'à PUBLISH."
persona: software-engineer
---

# Premier run sous GitHub Copilot CLI

Dans ce tutoriel, vous installez SKRAFT dans GitHub Copilot CLI, lancez la story « #42 Pay by
card » sur un petit dépôt, répondez à ses questions dans le chat, et suivez le run jusqu'au
bout. À la fin, le journal du workflow dit `checkout: done: PUBLISH closed` et `skraft report`
montre chaque étape du run.

Un seul parcours, du début à la fin ; chaque étape dit ce que vous devez voir. Le run lance de
vrais agents : comptez du temps et les crédits Copilot qu'ils consomment.

:::info[Avant de commencer]

- **Node 22** ou plus, et npm ;
- **Git** ;
- **GitHub Copilot CLI**, connecté à votre compte.

:::

## 1. Créer le petit dépôt {#1-create-the-small-repository}

Dans un terminal, créez le dossier `shop` et ses fichiers :

```console
$ mkdir shop
$ cd shop
$ git init -b main
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

```console
$ npm install --save-dev --prefix web @stryker-mutator/core@9.6.1 @stryker-mutator/tap-runner@9.6.1
$ git add .
$ git commit -m "Start the shop"
$ git switch -c pay-by-card
```

`git status` ne montre plus rien à commiter.

## 2. Installer le plugin {#2-install-the-plugin}

Toujours dans le terminal :

```console
$ copilot plugin marketplace add SebastienDegodez/skraft-plugin
$ copilot plugin install skraft@skraft
$ copilot plugin list
```

`skraft` figure dans la liste.

## 3. Décrire le dépôt {#3-describe-the-repository}

La ligne de commande `skraft` est un script Node livré avec le plugin. Depuis la racine de `shop`,
avec `<dossier du plugin skraft>` le dossier où Copilot a installé le plugin :

```console
$ node "<dossier du plugin skraft>/engine/drivers/cli/skraft.mjs" init
```

Dans la suite, `skraft …` veut dire cette commande complète, ou la commande `skraft` que
[`skraft install`](../how-to/install-on-a-host.mdx#skraft-command) met en place. Vous voyez :

![Terminal : skraft init répond « skraft-config.json: web (javascript, web) »](/img/screenshots/shared/terminal-init.svg)

*Figure 1 — Un composant, `web`, avec ses commandes `test` et `mutation`, est écrit dans
`skraft-config.json`.*

Commitez la configuration, puis vérifiez la machine :

```console
$ git add skraft-config.json .gitignore
$ git commit -m "chore: describe the shop for skraft"
$ skraft doctor
```

La dernière ligne de `skraft doctor` dit `no check failed, 3 with a warning`. Aucun des
avertissements ne bloque : `forge` dit que le dépôt n'a pas encore de remote, `web` n'a pas de recette de mocking JavaScript, et le petit dépôt
n'appelle aucun service ; `models/copilot` dit que, sans modèle configuré, chaque agent tourne sur le
modèle de votre session.

## 4. Lancer la story {#4-start-the-story}

Ouvrez une session Copilot dans `shop` :

```console
$ copilot
```

Tapez la commande :

```console title="Copilot CLI"
> /skraft checkout #42 Pay by card
```

La commande lance le workflow dynamique `skraft-pipeline` avec `{ slug: "checkout", issue: 42, title:
"Pay by card" }`. (Vous pouvez aussi taper `/agent`, choisir `skraft:skraft-orchestrator`, puis écrire :
*Lance le pipeline checkout pour l'issue 42, titre « Pay by card ».* Il lance le même workflow.) Le dépôt n'a pas de remote : le run démarre quand même, ses agents n'ont que le
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

## 5. Répondre à la première question {#5-answer-the-first-question}

Copilot vous pose une question dans le chat, une seule fois : skraft peut-il pousser la branche et
ouvrir la pull request à la fin du run ? La question s'affiche ainsi :

```console title="Copilot CLI"
May skraft push this branch and open or update its pull request when a run ends, and keep one comment on its story's issue up to date with the run's progress, time and cost? ACCEPTED or DECLINED; the answer is kept in skraft-config.json (publish.pullRequest) for every later run.
```

:::note[Capture en attente d'un vrai run]

Une capture de la boîte de confirmation de Copilot pour cette question demande une vraie session
Copilot CLI. D'ici là, le bloc ci-dessus montre son texte.

:::

Si votre client Copilot affiche les canvas, demandez-lui
d'ouvrir le canvas `skraft-pipeline` : il montre la même question et le workflow.

![Canvas skraft-pipeline : statut WAITING, bouton « On a besoin de vous » dans l'en-tête, encadré « Pull request » avec la question et la façon d'y répondre, RESEARCH ouverte sur publish_consent, les autres phases à venir](/img/screenshots/shared/pipeline-canvas-question.png)

*Figure 2 — Le canvas `skraft-pipeline` du dépôt `shop` : le run attend la réponse à
`publish_consent-1`. Le canvas montre ; c'est dans le chat que vous répondez.*

Choisissez **DECLINED** : ce dépôt n'a pas de remote. La réponse est écrite dans
`skraft-config.json` et ne sera plus redemandée.

## 6. Suivre RESEARCH et DESIGN {#6-follow-research-and-design}

Tapez `/workflows` pour voir le journal du run. Chaque agent y apparaît avec sa famille de modèle :

```console title="Copilot CLI"
> /workflows
checkout: solution-researcher, attempt 1 — researcher · standard · model chosen by the host
```

:::note[Capture en attente d'un vrai run]

Une capture de la liste `/workflows` dans Copilot CLI demande une vraie session. D'ici là, le bloc
ci-dessus montre la ligne du journal.

:::

Quand l'architecte propose un ADR et que les trois lentilles de la revue de conception l'ont
approuvé, Copilot vous pose la question suivante : ratifier l'ADR. Le canvas la montre aussi :

![Canvas skraft-pipeline : statut WAITING avec un bouton « On a besoin de vous » sur la question ADR adr-1, RESEARCH cochée, DESIGN ouverte avec design et design_review faits, adr en cours ; sous le workflow, la revue design_review approuvée et le modèle de chaque agent](/img/screenshots/shared/pipeline-canvas-adr.png)

*Figure 3 — Le run attend la ratification de l'ADR. Capture faite sur le dépôt scripté des tests
d'intégration, dont l'ADR s'appelle `adr-001-card-payment.md` ; le vôtre porte le titre que
l'architecte lui a donné.*

Ouvrez l'ADR sous `docs/adr/`, lisez-le, puis choisissez **RATIFIED** dans le chat. Le moteur le
passe `Accepted` et le commite : `docs(adr): ratify ADR-001`.

## 7. Laisser finir DISTILL, DELIVER et PUBLISH {#7-let-distill-deliver-and-publish-finish}

Le run continue sans vous : tests d'acceptation, cycles TDD, gates, revue DELIVER, mutation, puis
la description de la pull request. Le journal de `/workflows` se termine ainsi :

![Journal du workflow skraft-pipeline : phase PUBLISH, pr-writer, la pull request non ouverte car publish.pullRequest vaut false, PUBLISH closed, puis checkout: done: PUBLISH closed](/img/screenshots/shared/terminal-workflow-log.svg)

*Figure 4 — La fin du journal : la description est écrite dans `pull-request.md`, rien n'est
poussé, le run est fini.*

Le canvas coche alors chaque phase :

![Canvas skraft-pipeline : statut DONE, « PUBLISH closed », RESEARCH à PUBLISH cochées avec chaque étape et son résultat, puis les revues approuvées et les gates passées](/img/screenshots/shared/pipeline-canvas-done.png)

*Figure 5 — Un run terminé dans le canvas (dépôt scripté des tests d'intégration). Les étapes
`kill_proposal` à `mutation_gates` restent grises : aucun mutant n'a survécu.*

Son onglet **Journal** relit `events.jsonl` : la chaîne de hachage est-elle intacte, puis chaque étape
enregistrée et chaque décision humaine, avec qui l'a confirmée.

![Canvas skraft-pipeline, onglet Journal : la chaîne de hachage intacte, 62 lignes chaînées chacune à la précédente et signées ; puis chaque étape avec sa phase, son passage et son résultat, et la décision humaine adr-1 RATIFIED par host-confirmed](/img/screenshots/shared/pipeline-canvas-journal.png)

*Figure 6 — L'onglet Journal du run terminé : `adr-1` a été ratifiée par la boîte de confirmation
de Copilot elle-même (`host-confirmed`).*

## 8. Lire le rapport du run {#8-read-the-runs-report}

Dans le terminal, à la racine de `shop` :

```console
$ skraft report
```

![Terminal : skraft report, un tableau d'une ligne par étape avec ses visites, tentatives, relances, temps, coût et résultat, une ligne Total, puis la question adr-1 répondue RATIFIED par host-confirmed](/img/screenshots/shared/terminal-report-done.svg)

*Figure 7 — Le rapport d'un run terminé. Sur le dépôt scripté, les agents répondent aussitôt, d'où
des temps nuls ; sous Copilot, la colonne Coût reste vide : Copilot compte en crédits.*

La dernière table dit qui a répondu : `host-confirmed`, c'est-à-dire vous, dans la boîte de
dialogue de Copilot. Ouvrez enfin `.copilot-tracking/skraft-plans/checkout/pull-request.md` : c'est
la description de la pull request que votre run a produite.

## Ce que vous avez construit {#what-you-built}

Le dépôt `shop` porte maintenant une story menée jusqu'à PUBLISH sous Copilot CLI, son journal et
la description de sa pull request. En chemin, vous avez appris que :

- sous Copilot CLI, `/skraft <slug> [#issue] [titre]` (ou l'agent `skraft:skraft-orchestrator`) lance le
  workflow `skraft-pipeline`, et le moteur conduit chaque phase ;
- chaque décision vous est posée une seule fois, dans le chat ; votre réponse est journalisée
  `host-confirmed` ;
- `/workflows` montre le journal du run, et le canvas `skraft-pipeline` le workflow et la question en
  attente, sans jamais prendre de réponse ;
- `skraft report` relit le run depuis le journal : chaque étape, ses passages et ses réponses.

## Prochaines étapes {#next-steps}

- [Répondre à une question du run](../how-to/answer-a-question.mdx) — quand la question n'a pas pu être posée, ou que vous l'avez fermée.
- [Reprendre un run](../how-to/resume-a-run.mdx)
- [Choisir les modèles des agents](../how-to/choose-models.md) — pour faire disparaître l'avertissement `models/copilot`.

Utiles aussi : [Hôtes](../reference/hosts.md#copilot-cli) (le workflow, le canvas et l'outil
`skraft_decide`) et [Premiers pas](./getting-started.md) (le même parcours sous Claude Code).
