---
layout: doc
lang: fr
title: "Premiers pas"
description: "Installer SKRAFT V2 dans Claude Code, décrire un petit dépôt, et mener une story de RESEARCH à la description de sa pull request."
persona: software-engineer
---

# Premiers pas

> Dans ce tutoriel, vous installez SKRAFT dans Claude Code, décrivez un petit dépôt dans
> `skraft-config.json`, et menez la story « #42 Pay by card » à travers RESEARCH, DESIGN, DISTILL,
> DELIVER et PUBLISH. À la fin, `skraft status` montre chaque phase fermée et la description de la
> pull request vous attend dans le dossier de suivi.

Vous suivez un seul parcours, du début à la fin. Chaque étape dit ce que vous devez voir. Un run
complet lance de vrais agents : comptez du temps, et le coût que Claude Code facture pour eux.

## Ce dont vous avez besoin

- **Node 22** ou plus, et npm ;
- **Git** ;
- **Claude Code**.

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

`git status` ne montre plus rien à commiter.

## 2. Installer le plugin

Ouvrez Claude Code dans le dossier `shop`. Saisissez ces deux commandes **dans la conversation**,
pas dans un terminal :

```text
/plugin marketplace add SebastienDegodez/skraft-plugin
/plugin install skraft
```

Ouvrez `/plugin` : `skraft` apparaît dans les plugins installés.

## 3. Décrire le dépôt avec `skraft init`

La ligne de commande `skraft` est un script Node livré avec le plugin. Lancez-la depuis la racine
de `shop` :

```text
node "<dossier du plugin skraft>/engine/drivers/cli/skraft.mjs" init
```

Remplacez `<dossier du plugin skraft>` par le dossier où Claude Code a installé le plugin. Dans la
suite, `skraft …` veut dire cette commande complète.

`skraft init` cherche les projets du dépôt et écrit un **composant** par projet : une partie du
dépôt avec sa racine, sa stack, ses chemins et ses commandes. Vous voyez :

![Terminal : skraft init répond « skraft-config.json: web (javascript, web) »]({{ "/assets/screenshots/shared/terminal-init.svg" | relative_url }})

*Figure 1 — `skraft init` a trouvé un composant, `web`, en JavaScript.*

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

`test` vient du script de `web/package.json` ; `mutation` est le défaut StrykerJS. `paths` est aussi
le **périmètre d'écriture** de DELIVER : le software engineer ne pourra écrire que dans `web/src` et
`web/test`. `skraft init` a aussi ajouté `skraft-config.local.json`, votre couche personnelle, au
`.gitignore`. Commitez les deux fichiers :

```text
git add skraft-config.json .gitignore
git commit -m "chore: describe the shop for skraft"
```

## 4. Vérifier avec `skraft doctor`

`skraft doctor` vérifie que chaque commande peut tourner sur votre machine et montre sur quel
modèle chaque agent tournera :

```text
skraft doctor
```

Vous voyez, avec vos propres chemins et versions :

![Terminal : skraft doctor, des lignes ok et deux WARN, puis la table des modèles sous Claude Code, et « no check failed, 2 with a warning »]({{ "/assets/screenshots/shared/terminal-doctor.svg" | relative_url }})

*Figure 2 — `skraft doctor` sur le dépôt `shop` : aucun contrôle en échec, deux avertissements.
La table des modèles est coupée après ses premières lignes.*

Les deux avertissements ne bloquent pas ce tutoriel : le premier dit qu'aucune recette de mocking
n'existe pour un composant JavaScript, et le petit dépôt n'appelle aucun service ; le second ne
concerne que Copilot. La dernière ligne compte : `no check failed`.

## 5. Lancer la story

Dans la conversation Claude Code, saisissez :

```text
/skraft checkout #42 Pay by card
```

`checkout` est le **slug** : le nom du pipeline, en kebab-case. `#42` est le numéro de l'issue,
`Pay by card` son titre. Le dépôt n'a pas de remote : le run démarre quand même, ses agents n'ont
que le numéro et le titre de l'issue. Claude Code répond :

```text
skraft checkout started — progress in the Skraft pane.
```

Le panneau **Skraft** s'ouvre. Il dessine le workflow, une ligne par phase suivie de ses étapes, et
coche chaque étape à mesure qu'elle tourne.

Aussitôt, une boîte de dialogue intitulée **Pull request** demande si skraft peut pousser la
branche et ouvrir la pull request à la fin du run. **Laissez-la ouverte** pour l'étape suivante.

## 6. Regarder le run depuis un terminal

Pendant que la boîte de dialogue attend, lancez dans un terminal, à la racine de `shop` :

```text
skraft status
```

![Terminal : skraft status montre « skraft checkout: waiting », RESEARCH open, les autres phases pending, et la question publish-consent]({{ "/assets/screenshots/shared/terminal-status-waiting.svg" | relative_url }})

*Figure 3 — Le run attend votre réponse : RESEARCH est ouverte, la question `publish-consent` est
celle de la boîte de dialogue.*

`skraft status` relit le journal que le moteur écrit ; il ne change rien au run.

Revenez à la boîte de dialogue : ce dépôt n'a pas de remote, choisissez **DECLINED**. La réponse est
écrite dans `skraft-config.json` (`"publish": { "pullRequest": false, … }`) et ne sera plus
redemandée. Aucune question sur les captures d'écran n'est posée : aucun composant n'est un front.

## 7. RESEARCH et DESIGN

Le journal du panneau montre chaque étape, par exemple :

```text
checkout: publish_consent DECLINED
checkout: visuals_consent DECLINED (no component of skraft-config.json is a front end (stack react, or an e2e command), so no screenshot is taken)
checkout: solution-researcher, attempt 1
```

`solution-researcher` remplit le document de recherche que le moteur a pré-créé :
`.copilot-tracking/skraft-plans/checkout/research/<AAAA-MM-JJ>/checkout-research.md`.

`solution-architect` conçoit ensuite la story : ses documents vont sous
`.copilot-tracking/skraft-plans/checkout/details/<AAAA-MM-JJ>/`, ses ADR sous `docs/adr/`. Trois
lentilles revoient la conception (consistency, architecture-compliance, fitness).

Quand la conception propose un ADR, une boîte de dialogue intitulée **ADR** demande :

```text
Ratify the Proposed ADRs docs/adr/adr-001-<title>.md? RATIFIED marks them Accepted; REJECTED sends DESIGN back with your reason.
```

Ouvrez l'ADR, lisez-le, puis choisissez **RATIFIED**. Le moteur le passe `Accepted` et le commite
seul : `git log --oneline -1 -- docs/adr` montre `docs(adr): ratify ADR-001`.

## 8. DISTILL et DELIVER

`acceptance-designer` écrit les scénarios et le plan de test
(`details/<AAAA-MM-JJ>/test-plan-checkout.md`) et commite les tests d'acceptation en échec. Quatre
lentilles le revoient (coverage, business-alignment, testability, boundary-enforcement).

`software-engineer` livre ensuite par cycles TDD : un commit `test(…)` qui échoue, puis un commit
`feat(…)` ou `fix(…)` qui le fait passer. Le moteur rejoue chaque commit rouge : un commit « rouge »
dont les tests passent est refusé.

Le moteur lance ensuite les gates du composant (`test`), puis la revue DELIVER (test-integrity,
architecture-boundaries, cold-reader), puis la mutation, une seule fois, sur le code revu. Le
panneau coche `gates`, `deliver_review` et `mutation`.

## 9. PUBLISH

`pr-writer` écrit le résumé de la pull request ; le moteur rend le reste depuis le journal. Comme
vous avez refusé la publication, rien n'est poussé ; le journal du panneau dit :

```text
checkout: publish: pull request not opened: skraft-config.json sets publish.pullRequest to false; pull-request.md holds its description, and skraft publish opens it once that is fixed
```

Le run se termine sur cette notification :

```text
skraft checkout: done — PUBLISH closed
```

## 10. Lire le résultat

Dans le terminal, à la racine de `shop` :

```text
skraft status
```

![Terminal : skraft status montre « skraft checkout: done » et RESEARCH à PUBLISH closed]({{ "/assets/screenshots/shared/terminal-status-done.svg" | relative_url }})

*Figure 4 — Un run terminé : chaque phase est `closed`. Capture faite sur le dépôt scripté des tests
d'intégration ; sous Claude Code, une ligne `cost:` s'ajoute avec le coût que l'hôte a rapporté.*

Relancez vous-même les gates sur le code livré :

```text
skraft gate --all
```

![Terminal : skraft gate --all, pass web/test et pass web/mutation, « 2 gates passed on web »]({{ "/assets/screenshots/shared/terminal-gates.svg" | relative_url }})

*Figure 5 — Les deux gates du composant `web` passent.*

Le dossier de suivi `.copilot-tracking/skraft-plans/checkout/` contient maintenant :

| Fichier | Ce que c'est |
|---|---|
| `events.jsonl` | le journal : un événement signé et chaîné par fait |
| `WORKFLOW.md` | le graphe du workflow avec chaque étape faite |
| `run-report.md` | le tableau qu'affiche `skraft report` : temps, coût et relances de chaque étape |
| `qa-report.md` | le plan de test, les dernières gates avec le score de mutation, les commits rouges, le verdict de chaque revue |
| `pull-request.md` | la description de la pull request, prête à publier |
| `gates/web/` | la sortie de chaque gate |
| `reviews/` | ce que chaque passage de revue a lu, et son `verdict.yaml` |

Ouvrez `pull-request.md` : c'est le résultat de votre premier run. `git log --oneline` montre, sur
`pay-by-card`, les documents de recherche et de conception, l'ADR ratifié, les tests d'acceptation
en échec, puis les commits rouges et verts de chaque cycle TDD.

## Ce que vous avez appris

- `skraft init` décrit votre dépôt en composants dans `skraft-config.json`, et leurs chemins sont le
  périmètre d'écriture de DELIVER ;
- `skraft doctor` dit ce qui manque sur votre machine avant un run, et sur quel modèle chaque agent
  tourne ;
- `/skraft <slug> #<issue> <titre>` lance la story ; le moteur conduit chaque phase, ne vous demande
  que les décisions, et enregistre tout ;
- `skraft status` relit le run depuis un terminal, et `skraft gate` repasse ses gates ;
- le run se termine par une description de pull request, publiée quand vous y consentez.

## Pages suivantes

- [Premier run sous GitHub Copilot CLI]({{ "/fr/tutorials/first-run-copilot" | relative_url }}) — le même parcours, suivi dans le canvas Copilot.
- [Publier la pull request d'un run]({{ "/fr/how-to/publish-pull-request" | relative_url }})
- [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }})
- [Installer skraft sur un hôte]({{ "/fr/how-to/install-on-a-host" | relative_url }}) — Windows, VS Code, plugins optionnels.
- [Hôtes]({{ "/fr/reference/hosts" | relative_url }}) — ce que chaque hôte montre et demande.
- [Moteur, pilotes, profondeur 1]({{ "/fr/explanation/architecture" | relative_url }})
