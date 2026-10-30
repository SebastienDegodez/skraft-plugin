---
layout: doc
lang: fr
title: "Premiers pas"
description: "Installer SKRAFT V2, décrire un petit dépôt, et mener une story de RESEARCH à la description de sa pull request."
persona: software-engineer
---

# Premiers pas

> Dans ce tutoriel, vous installez SKRAFT, décrivez un petit dépôt dans `skraft-config.json`,
> et menez la story « #42 Pay by card » à travers RESEARCH, DESIGN, DISTILL, DELIVER et PUBLISH.

Vous suivez un seul parcours, du début à la fin. Chaque étape montre ce que vous devez voir. Un
run complet lance de vrais agents : comptez du temps, et le coût que votre hôte facture pour eux.

## Ce dont vous avez besoin

- **Node 22** ou plus, et npm ;
- **Git** ;
- **Claude Code** (pour GitHub Copilot CLI ou VS Code, voir [Sur un autre hôte](#sur-un-autre-hôte)
  après le parcours).

## 1. Créer le petit dépôt

Créez un dossier `shop`, ouvrez un terminal dedans et créez le dépôt :

```text
git init -b main
```

Créez `web/package.json` :

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

Créez `web/src/cart.js` :

```js
export const total = (prices) => prices.reduce((sum, price) => sum + price, 0)
```

Créez `web/test/cart.test.js` :

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { total } from '../src/cart.js'

test('the total of a cart adds its prices', () => {
  assert.equal(total([2, 3]), 5)
})
```

La gate de mutation lance StrykerJS. Installez-le dans `web` :

```text
npm install --save-dev --prefix web @stryker-mutator/core @stryker-mutator/tap-runner
```

et créez `web/stryker.config.json` :

```json
{
  "testRunner": "tap",
  "mutate": ["src/**/*.js"],
  "tap": { "testFiles": ["test/**/*.test.js"], "nodeArgs": ["--test-reporter=tap"] }
}
```

Ajoutez `node_modules/` et `reports/` à un `.gitignore` à la racine de `shop`, enregistrez un
premier commit, puis travaillez sur une branche à vous :

```text
git add .
git commit -m "Start the shop"
git switch -c pay-by-card
```

## 2. Installer le plugin

Ouvrez Claude Code dans le dossier `shop`. Saisissez ces deux commandes **dans la conversation**,
pas dans un terminal :

```text
/plugin marketplace add SebastienDegodez/skraft-plugin
/plugin install skraft
```

Ouvrez `/plugin` : `skraft` apparaît dans les plugins installés.

**Sous Windows**, si `/plugin marketplace add` échoue à cause d'un chemin trop long, clonez le
dépôt dans un chemin court, puis ajoutez ce clone :

```powershell
git clone https://github.com/SebastienDegodez/skraft-plugin C:\s\skraft
```

```text
/plugin marketplace add C:\s\skraft
/plugin install skraft
```

## 3. Écrire `skraft-config.json`

La ligne de commande `skraft` est un script Node livré avec le plugin. Lancez-la depuis la racine
de votre dépôt, sous sh comme sous PowerShell :

```text
node "<dossier du plugin skraft>/engine/drivers/cli/skraft.mjs" init
```

Remplacez `<dossier du plugin skraft>` par le dossier où l'hôte a installé le plugin skraft. Dans
la suite, `skraft …` veut dire cette commande complète.

`skraft init` cherche les projets du dépôt et écrit un **composant** par projet : une partie du
dépôt avec sa racine, sa stack, ses chemins et ses commandes. Vous voyez :

```text
skraft-config.json: web (javascript, web)
```

Ouvrez `skraft-config.json` à la racine de `shop` :

```json
{
  "components": [
    {
      "name": "web",
      "root": "web",
      "stack": "javascript",
      "paths": {
        "src": ["src/"],
        "tests": ["test/"]
      },
      "commands": {
        "test": "npm test",
        "mutation": "npx stryker run --incremental --reporters json,clear-text"
      }
    }
  ]
}
```

`test` vient du script de `web/package.json` ; `mutation` est le défaut StrykerJS, qui écrit son
rapport là où le moteur le lit. `paths` est aussi le **périmètre d'écriture** de DELIVER : le
software engineer ne peut écrire que dans `web/src` et `web/test`. Un composant JavaScript mocke
en mémoire par défaut : il n'a pas besoin de Docker. Commitez le fichier :

```text
git add skraft-config.json
git commit -m "chore: describe the shop for skraft"
```

## 4. Vérifier avec `skraft doctor`

`skraft doctor` vérifie que chaque commande peut tourner sur votre machine et montre sur quoi
chaque agent tournera :

```text
skraft doctor
```

Vous voyez, avec vos propres chemins et versions :

```text
ok    node: Node v22.…
ok    config: 1 components: web
ok    web/test: npm → /usr/local/bin/npm
ok    web/mutation: npx → /usr/local/bin/npx
ok    models/claude-code: every family the workflow's agents run on has a model on claude-code
WARN  models/copilot: no model on copilot for researcher (1 dispatch), planner (1 dispatch), reviewer (13 dispatches), standard (4 dispatches), implementer (3 dispatches), economy (1 dispatch); these run on the session's model
ok    vscode: …
models on claude-code:
  step             agent                         type     family       tier      model   effort  source (family/model/effort)
  research         solution-researcher           phase    researcher   standard  sonnet  -       agent/tier/host
  design           solution-architect            phase    planner      frontier  opus    -       agent/tier/host
  design_review    consistency-lens              lens     reviewer     economy   haiku   -       type/tier/host
  …
  design_review    finding-refuter               refuter  standard     standard  sonnet  -       escalation/family/host
  …
  pr_writer        pr-writer                     phase    economy      economy   haiku   -       agent/family/host
models on copilot:
  …
skraft doctor: no check failed, 1 with a warning
```

L'avertissement Copilot ne compte pas sous Claude Code. Une ligne `FAIL` (programme introuvable,
racine absente, composant sans commande de gate) se corrige dans la configuration : suivez le
guide [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }}).

## 5. Lancer la story

Dans la conversation Claude Code, saisissez :

```text
/skraft checkout #42 Pay by card
```

`checkout` est le **slug** : le nom du pipeline, en kebab-case. `#42` est le numéro de l'issue,
`Pay by card` son titre. Quand le remote du dépôt nomme une forge GitHub et que `gh` y est connecté,
le moteur y lit l'issue et chaque agent en lit le corps, critères d'acceptation compris. Ici le
dépôt n'a pas de remote : le run démarre quand même, ses agents n'ont que le numéro et le titre, et
le journal dit pourquoi le corps n'a pas été lu. Claude Code répond :

```text
skraft checkout started — progress in the Skraft pane.
```

Le panneau **Skraft** s'ouvre. Il dessine le workflow, une ligne par phase suivie de ses étapes,
et coche chaque étape à mesure qu'elle tourne.

La première étape est une question. Une boîte de dialogue intitulée **Pull request** demande :

```text
May skraft push this branch and open or update its pull request when a run ends, and keep one comment on its story's issue up to date with the run's progress, time and cost? ACCEPTED or DECLINED; the answer is kept in skraft-config.json (publish.pullRequest) for every later run.
```

Ce dépôt n'a pas de remote : choisissez **DECLINED**. La réponse est écrite dans
`skraft-config.json` (`"publish": { "pullRequest": false, … }`) et n'est plus redemandée. La
question des captures n'est pas posée : aucun composant n'est un front.

## 6. RESEARCH et DESIGN

Le journal du panneau montre chaque étape, par exemple :

```text
checkout: publish_consent DECLINED
checkout: visuals_consent DECLINED (no component of skraft-config.json is a front end (stack react, or an e2e command), so no screenshot is taken)
checkout: solution-researcher, attempt 1
```

`solution-researcher` remplit le document de recherche que le moteur a pré-créé :
`.copilot-tracking/skraft-plans/checkout/research/<AAAA-MM-JJ>/checkout-research.md`.

`solution-architect` conçoit ensuite la story : ses documents vont sous
`.copilot-tracking/skraft-plans/checkout/details/<AAAA-MM-JJ>/`, ses ADR sous `docs/adr/`. Le
moteur refuse l'étape si l'architecte a écrit ailleurs. Trois lentilles revoient la conception
(consistency, architecture-compliance, fitness) ; un verdict `NEEDS_REWORK` renvoie la conception
avec les findings confirmés.

Quand la conception propose un ADR, une boîte de dialogue intitulée **ADR** demande :

```text
Ratify the Proposed ADRs docs/adr/adr-001-<title>.md? RATIFIED marks them Accepted; REJECTED sends DESIGN back with your reason.
```

Lisez l'ADR, puis choisissez **RATIFIED**. Le moteur le passe `Accepted` et le commite seul,
`docs(adr): ratify ADR-001`. Avec **REJECTED**, une seconde boîte de dialogue demande votre
raison, qui retourne à l'architecte.

Si vous fermez une boîte de dialogue sans répondre, le run **attend**. Répondez plus tard par
`/skraft decide <réponse>` dans la conversation, ou par un bouton du panneau ; le run reprend là
où il s'était arrêté.

## 7. DISTILL et DELIVER

`acceptance-designer` écrit les scénarios et le plan de test
(`details/<AAAA-MM-JJ>/test-plan-checkout.md`) et commite les tests d'acceptation en échec. Quatre
lentilles le revoient (coverage, business-alignment, testability, boundary-enforcement).

`software-engineer` livre ensuite par cycles TDD. Chaque cycle est un commit `test(…)` qui échoue,
puis un commit `feat(…)` ou `fix(…)` qui le fait passer, chacun citant `#42`. Après chaque étape,
le moteur rejoue les commits rouges : un commit « rouge » dont les tests passent est refusé.

Le moteur lance ensuite lui-même les gates, depuis `web` : `test`. La revue DELIVER lance ses
lentilles (test-integrity, architecture-boundaries, cold-reader). Enfin, `mutation`, une seule
fois, sur le code revu : elle doit atteindre 100 % sur le cœur métier (un dossier `domain` ou
`application`) et 80 % ailleurs. Quand des mutants survivent, le software engineer propose,
fichier par fichier, comment traiter chacun ; skraft vous demande une fois s'il faut appliquer la
proposition, les traiter à votre façon, ou arrêter ; la correction passe ensuite sous la lentille
test-integrity, puis les gates, puis la mutation à nouveau.

## 8. PUBLISH

`pr-writer` écrit le résumé de la pull request, et le moteur rend le reste depuis le journal.
Comme vous avez refusé la publication, rien n'est poussé ; le journal du panneau dit :

```text
checkout: publish: pull request not opened: skraft-config.json sets publish.pullRequest to false; pull-request.md holds its description, and skraft publish opens it once that is fixed
```

Le run se termine sur cette notification :

```text
skraft checkout: done — PUBLISH closed
```

## 9. Lire le run

Dans le terminal, à la racine de `shop` :

```text
skraft status
```

Vous voyez :

```text
skraft checkout: done
RESEARCH  closed
DESIGN  closed
DISTILL  closed
DELIVER  closed
PUBLISH  closed
cost: ~$…
PUBLISH closed
```

La ligne `cost:` apparaît quand l'hôte rapporte le coût. `skraft report` affiche le temps, le coût
et les relances de chaque étape :

```text
skraft checkout: done
| Step | Phase | Visits | Attempts | Retries | Time | Cost | Outcome |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| publish_consent | RESEARCH | 1 | 1 | 0 | … | - | answered |
| visuals_consent | RESEARCH | 1 | 1 | 0 | 0 s | - | skipped |
| research | RESEARCH | 1 | 1 | 0 | … | … | done |
| design | DESIGN | 1 | 1 | 0 | … | … | done |
| design_review | DESIGN | 1 | 1 | 0 | … | … | approved |
| adr | DESIGN | 1 | 1 | 0 | … | - | answered |
| … | | | | | | | |
| gates | DELIVER | 1 | 1 | 0 | … | - | pass |
| deliver_review | DELIVER | 1 | 1 | 0 | … | … | approved |
| mutation | DELIVER | 1 | 1 | 0 | … | - | pass |
| visuals | DELIVER | 1 | 1 | 0 | 0 s | - | skipped |
| pr_writer | PUBLISH | 1 | 1 | 0 | … | … | done |
| publish | PUBLISH | 1 | 1 | 0 | … | - | local |
| Total | | | … | … | … | … | |
PUBLISH closed
```

Une étape renvoyée par une revue ou une gate montre plus de visites et de relances. Le dossier de
suivi `.copilot-tracking/skraft-plans/checkout/` contient maintenant :

| Fichier | Ce que c'est |
|---|---|
| `events.jsonl` | le journal : un événement signé et chaîné par fait |
| `WORKFLOW.md` | le graphe du workflow avec chaque étape faite |
| `run-report.md` | le tableau qu'affiche `skraft report` |
| `qa-report.md` | le plan de test, les dernières gates avec le score de mutation, les commits rouges, le verdict de chaque revue |
| `pull-request.md` | la description de la pull request, prête à publier |
| `gates/web/` | la preuve de chaque gate : commande, dossier, résultat, sorties |
| `reviews/` | ce que chaque passage de revue a lu, et son `verdict.yaml` |

`git log --oneline` montre les commits du run sur `pay-by-card` : les documents de recherche et
de conception, l'ADR ratifié, les tests d'acceptation en échec, puis les commits rouges et verts
de chaque cycle TDD.

## Ce que vous avez appris

- `skraft init` décrit votre dépôt en composants dans `skraft-config.json`, et leurs chemins sont
  le périmètre d'écriture de DELIVER ;
- `skraft doctor` vous dit ce qui manque sur votre machine avant un run, et sur quel modèle chaque
  agent tourne ;
- `/skraft <slug> #<issue> <titre>` lance la story ; le moteur conduit chaque phase, ne vous
  demande que les décisions, et enregistre tout ;
- `skraft status` et `skraft report` lisent le run dans son journal ;
- le run se termine par une description de pull request, publiée quand vous y consentez.

Pour publier celle-ci plus tard, ajoutez un remote, installez `gh` et connectez-vous, puis lancez
`skraft publish` : tapée par vous, la commande vaut consentement pour cette publication.

## Sur un autre hôte

- **GitHub Copilot CLI** : à l'étape 5, sélectionnez `skraft:skraft-orchestrator` et donnez-lui le
  slug, l'issue et le titre ; il lance le workflow `skraft-pipeline`. Les questions s'affichent
  dans le chat, une seule fois : votre choix est la réponse. Sans cette boîte de dialogue, vous répondez
  par `skraft decide` dans un terminal.
- **VS Code** : à l'étape 5, lancez
  `node "<dossier du plugin skraft>/engine/drivers/copilot-sdk/skraft-run.mjs" checkout --issue 42 --title "Pay by card"`
  dans un terminal. Sans le SDK Copilot, demandez à `skraft-orchestrator` dans le chat : il conduit
  `skraft next` / `skraft record`. `skraft doctor` dit lequel des deux s'applique.

Les autres étapes ne changent pas.

## Pages suivantes

- [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }})
- [Publier la pull request d'un run]({{ "/fr/how-to/publish-pull-request" | relative_url }})
- [Lancer les gates et lire leurs preuves]({{ "/fr/how-to/run-gates" | relative_url }})
- [Reprendre ou débloquer un run]({{ "/fr/how-to/resume-a-run" | relative_url }})
- [La ligne de commande `skraft`]({{ "/fr/reference/cli" | relative_url }})
- [Moteur, pilotes, profondeur 1]({{ "/fr/explanation/architecture" | relative_url }})
