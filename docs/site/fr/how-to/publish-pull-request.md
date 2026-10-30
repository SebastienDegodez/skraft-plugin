---
layout: doc
lang: fr
title: "Publier la pull request d'un run"
description: "Consentir à la publication, préparer gh et le remote, laisser le run ouvrir sa pull request ou la publier avec skraft publish, suivre le run sur son issue et joindre les captures d'un frontend."
persona: software-engineer
---

# Publier la pull request d'un run

**But** : qu'un run terminé pousse sa branche et ouvre (ou mette à jour) sa pull request, avec
sa description rendue depuis le journal.

## Prérequis

- Un dépôt avec un remote GitHub ou GitHub Enterprise (`origin`, sinon le premier remote).
- `gh` installé ; Git et ssh capables de pousser sans demander de mot de passe.
- Un travail sur une branche à vous, pas sur la branche de base.
- `skraft` désigne `node "<dossier du plugin>/engine/drivers/cli/skraft.mjs"`.

## 1. Connecter `gh` à la forge du remote

```text
gh auth login --hostname github.com
```

Remplacez `github.com` par l'hôte de votre GitHub Enterprise le cas échéant. skraft lance `gh`
avec `--repo <hôte>/<owner>/<dépôt>` d'après l'URL du remote.

## 2. Donner le consentement

Au premier run du dépôt, la question `publish-consent` (en-tête `Pull request`) demande si skraft
peut pousser la branche, ouvrir ou mettre à jour sa pull request, et tenir à jour un commentaire
sur l'issue de la story. Répondez `ACCEPTED`
([Répondre à une question du run]({{ "/fr/how-to/answer-a-question" | relative_url }})). La
réponse est écrite dans `skraft-config.json` :

```json
{
  "publish": {
    "pullRequest": true,
    "questionVersions": { "pullRequest": 2 },
    "draft": false
  }
}
```

- `draft` : sans lui, la pull request est ouverte en brouillon ; `false` l'ouvre prête à relire.
- Un run lancé avec `--from-artifacts` ne pose pas la question : écrivez ces deux clés
  `pullRequest` et `questionVersions` à la main.
- Commitez `skraft-config.json` pour que l'équipe partage la réponse.

## 3. Laisser le run publier

En fin de run, la phase PUBLISH fait écrire le résumé à `pr-writer`, puis le nœud `publish` pousse
la branche (jamais en force, jamais la base ni la branche par défaut) et ouvre la pull request,
sur la base du run (`baseBranch`, `--base`, sinon `main`). Une pull request déjà ouverte pour la
branche est mise à jour.

Résultat : la notification `skraft <slug>: done — PUBLISH closed`, et la pull request sur la
forge, qui commence par `Refs #<issue>` (`Closes #<issue>` quand elle vise la branche par
défaut).

## 4. Publier plus tard avec `skraft publish`

Sans consentement, remote, `gh` ou connexion, le run se termine en local et garde la description
dans `.copilot-tracking/skraft-plans/<slug>/pull-request.md`. Corrigez la cause, puis :

```text
skraft publish
```

```text
pull request #128 opened as a draft: https://github.com/acme/shop/pull/128
```

Tapée par vous, la commande vaut consentement pour cette publication, même avec
`"pullRequest": false` ; le réglage ne change pas.

## 5. Suivre le run sur son issue

Démarrez le run avec le numéro de l'issue : `/skraft checkout #42 Pay by card`,
`skraft init checkout --issue 42`, ou l'argument `issue` du workflow Copilot. Avec le
consentement de l'étape 2, le run tient un seul commentaire sur l'issue, réécrit à chaque phase
close, revue renvoyée et fin de run. Son dernier corps reste dans
`.copilot-tracking/skraft-plans/<slug>/issue-progress.md`.

## 6. Joindre les captures d'un frontend

Pour un composant `react`, ou tout composant avec `commands.e2e`, le nœud `visuals` lance
`commands.e2e` après la revue DELIVER et joint les captures à la pull request.

1. Déclarez la commande e2e du frontend :

   ```json
   { "name": "web", "root": "web", "stack": "react",
     "commands": { "test": "npm test", "e2e": "npx playwright test" } }
   ```

2. Ajoutez deux projets et un reporter à la configuration Playwright du frontend :

   ```ts
   // playwright.config.ts
   import { defineConfig } from '@playwright/test'

   export default defineConfig({
     projects: [
       { name: 'light', use: { colorScheme: 'light' } },
       { name: 'dark', use: { colorScheme: 'dark' } },
     ],
     reporter: [['list'], ['./skraft-visuals-reporter.ts']],
   })
   ```

   ```ts
   // skraft-visuals-reporter.ts
   import { mkdirSync, writeFileSync } from 'node:fs'
   import { relative } from 'node:path'
   import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'

   export default class SkraftVisuals implements Reporter {
     private screenshots: Array<{ title: string, theme: string, path: string }> = []

     onTestEnd(test: TestCase, result: TestResult) {
       const theme = test.parent.project()?.name ?? ''
       for (const { name, path, contentType } of result.attachments) {
         if (contentType === 'image/png' && path) this.screenshots.push({ title: name, theme, path: relative(process.cwd(), path).split('\\').join('/') })
       }
     }

     onEnd() {
       mkdirSync('skraft-visuals', { recursive: true })
       writeFileSync('skraft-visuals/manifest.json', JSON.stringify({ screenshots: this.screenshots }))
     }
   }
   ```

3. Dans un test, prenez la capture sous `skraft-visuals/` et joignez-la avec son titre :

   ```ts
   const path = `skraft-visuals/checkout-${testInfo.project.name}.png`
   await page.screenshot({ path, fullPage: true })
   await testInfo.attach('Checkout, card paid', { path, contentType: 'image/png' })
   ```

4. Ajoutez `skraft-visuals/` au `.gitignore` du frontend.
5. Répondez `ACCEPTED` à la question `reporting-consent` (en-tête `Reporting`), ou écrivez
   `"visuals": true` sous `publish`.

Résultat : les captures sont commitées seules sur la branche
(`docs(evidence): screenshots of <composants>`) et la section Screenshots de la pull request les
montre, les sombres repliées. Les captures sont une preuve, pas une gate : un e2e en échec
n'arrête pas le run.

## Dépannage

| Message | Action |
|---|---|
| `<slug> has not completed; skraft publish opens the pull request of a completed run` | Terminer ou reprendre le run d'abord. |
| `pull request not opened: skraft-config.json sets publish.pullRequest to false; …` | `skraft publish`, ou répondre `ACCEPTED` au prochain run après avoir retiré la clé. |
| `pull request not opened: gh, the GitHub CLI, is not installed; …` | Installer `gh`, `gh auth login`, puis `skraft publish`. |
| `HEAD is on <branche>, the branch the pull request would merge into` | Passer sur une branche de travail, puis `skraft publish`. |
| `HEAD is detached, on no branch to push` | `git switch -c <branche>`, puis `skraft publish`. |
| Le push échoue sur un mot de passe ou une passphrase | Configurer un agent ssh ou un gestionnaire d'identifiants : git ne demande jamais rien pendant un run. |
| `not published (consent): skraft-config.json sets publish.visuals to false` | Écrire `"visuals": true` sous `publish` si les captures ne montrent aucune donnée privée. |
| `skraft-visuals/manifest.json is missing or is not an object with a screenshots list` | Vérifier que le reporter est déclaré et que `commands.e2e` lance Playwright depuis la racine du composant. |

Tous les messages : [`skraft publish`]({{ "/fr/reference/cli" | relative_url }}).

## Voir aussi

- [Phases — PUBLISH]({{ "/fr/reference/phases" | relative_url }}#publish)
- [skraft-config.json — `publish`]({{ "/fr/reference/skraft-config" | relative_url }}#publish)
- [Dossier de suivi et journal]({{ "/fr/reference/run-journal" | relative_url }}) —
  `pull-request.md`, `issue-progress.md`, `qa-report.md`.
