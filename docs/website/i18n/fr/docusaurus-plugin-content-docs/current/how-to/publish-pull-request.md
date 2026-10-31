---
title: "Publier la pull request d'un run"
description: "Consentir à la publication, préparer gh et le remote, laisser le run ouvrir sa pull request ou la publier avec skraft publish, suivre le run sur son issue et joindre les captures d'un frontend."
persona: software-engineer
---

# Publier la pull request d'un run

**But** : qu'un run terminé pousse sa branche et ouvre (ou mette à jour) sa pull request, avec
sa description rendue depuis le journal.

## Prérequis

- Un dépôt avec un remote GitHub, GitHub Enterprise ou Azure DevOps (`origin`, sinon le premier remote).
- `gh` installé (`az`, le CLI Azure, sur Azure DevOps : voir [Sur Azure DevOps](#azure-devops)) ; Git et ssh capables de pousser sans demander de mot de passe.
- Un travail sur une branche à vous, pas sur la branche de base.
- `skraft` est la commande que [`skraft install`](./install-on-a-host.mdx#skraft-command) met en place ; la ligne longue `node "<dossier du plugin>/engine/drivers/cli/skraft.mjs"` marche sans elle.

## 1. Connecter `gh` à la forge du remote

```console
$ gh auth login --hostname github.com
```

Remplacez `github.com` par l'hôte de votre GitHub Enterprise le cas échéant. skraft lance `gh`
avec `--repo <hôte>/<owner>/<dépôt>` d'après l'URL du remote. Quand l'hôte a un serveur MCP GitHub connecté, le moteur passe d'abord par lui pour l'issue et la pull request, et se replie sur `gh` quand le serveur est absent ou échoue, jamais quand vous ou l'hôte refusez un outil ([serveur MCP GitHub d'abord](../reference/skraft-config.md#github-mcp-server-first-gh-as-fallback)) ; le journal du run dit par quelle voie chaque opération est passée.

## 2. Donner le consentement

Au premier run du dépôt, la question `publish-consent` (en-tête `Pull request`) demande si skraft
peut pousser la branche, ouvrir ou mettre à jour sa pull request, et tenir à jour un commentaire
sur l'issue de la story. Répondez `ACCEPTED`
([Répondre à une question du run](./answer-a-question.mdx)). La
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
défaut). Un corps qui dépasse ce que la forge accepte (60 000 caractères sur GitHub, 4 000 sur Azure DevOps) garde ce qui décide et envoie les sections repliées dans un commentaire conservé ; `pull-request.md` garde la description entière.

### Ce que contient la description

La description commence par `Refs #<issue>` ; `Closes #<issue>` seulement quand la pull request vise la branche par défaut. What changes, Why, Decisions applied et Out of scope s'affichent sous leur titre. Consistency matrix (juste sous Decisions applied), Tests, RED evidence, Quality gates, Review, Screenshots, Run summary et AI disclosure sont repliés dans un bloc `<details>` dont le résumé compte ce qu'il contient ; Quality gates reste ouvert quand une gate a échoué, Review quand un constat attend un humain.

- **Tests** montre le plan de test écrit par DISTILL (`details/<date>/test-plan-<slug>.md`) ; **Consistency matrix** les matrices écrites par DESIGN (`details/<date>/consistency-matrix-<story>.md`, toutes celles de la dernière tentative qui en a écrit). Un fichier absent du dossier de suivi, ou vide, est signalé par un texte fixe.
- Ces fichiers sont écrits par des agents : ils sont neutralisés avant d'entrer dans la description. Les blocs de code restent tels quels ; partout ailleurs, code en ligne compris, les commentaires et balises HTML sont retirés, les titres `#` à `###` descendent au niveau 4, et chaque mot-clé de fermeture avec sa référence, chaque `@mention` et chaque `#12` nu passent en code. Seul un bloc ouvert en colonne 0 est un bloc de code ; un bloc laissé ouvert est retiré avec ce qui suit.
- En dessous de la limite de la forge, tout reste dans la description (GitHub jusqu'à 60 000 caractères, Azure DevOps jusqu'à 4 000) et aucun commentaire n'est écrit. Au-delà, la description garde ce qui décide (What changes, Why, Decisions applied, Out of scope, et toute section ouverte sur une gate échouée ou un constat pour un humain) et finit par une ligne fixe qui renvoie aux commentaires. Les autres sections vont dans un commentaire de la pull request intitulé `skraft · run details` (`skraft · détails du run` pour une histoire en français : le moteur distingue le français de l'anglais d'après le titre et le corps de l'issue ou du work item qu'il a gardés, l'anglais quand il ne peut pas trancher). Une section n'est jamais coupée entre deux commentaires : quand un commentaire ne suffit pas (60 000 caractères sur GitHub, 140 000 sur Azure DevOps, non mesuré), les détails vont dans des parties intitulées `skraft · détails du run 1/2`, `2/2`, et une partie devenue inutile est vidée, jamais supprimée. Chaque partie est réécrite en place à la publication suivante, et seulement quand son texte a changé. Une section plus longue qu'une partie est coupée avec une marque ; ce qui décide n'est coupé de la même façon que s'il dépasse à lui seul la limite de la description.
- Sur GitHub, le commentaire est un commentaire d'issue de la pull request. Sur Azure DevOps, c'est un fil de la pull request, posté `Closed` pour qu'une politique de branche sur la résolution des commentaires ne soit pas bloquée, par le serveur MCP Azure DevOps de l'hôte d'abord (`repo_repository`, `repo_pull_request_thread`, `repo_pull_request_thread_write`), puis `az devops invoke`. Une lecture ou une écriture que l'hôte refuse est définitive, sur les deux forges : elle n'est jamais retentée avec `gh` ni `az`, et le run le dit.
- Un commentaire est retrouvé par le marqueur qui l'ouvre, jamais par un marqueur cité plus loin : une réponse qui cite le marqueur n'est pas réécrite.
- Quand le commentaire ne peut pas être gardé, la pull request est tout de même publiée : le run le dit, `pull-request.md` garde toute la description, et `skraft publish` garde les détails une fois la cause corrigée.
- Une partie dont le texte n'a pas changé n'est pas réécrite, et skraft ne demande pas à la forge si son commentaire existe encore : un commentaire supprimé à la main est posté de nouveau au prochain changement des détails.

## 4. Publier plus tard avec `skraft publish`

Sans consentement, remote, `gh` ou connexion, le run se termine en local et garde la description
dans `.copilot-tracking/skraft-plans/<slug>/pull-request.md`. Corrigez la cause, puis :

```console
$ skraft publish
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

## Sur Azure DevOps <!-- #azure-devops -->

Avec `forge` à `azure-devops` dans `skraft-config.json`, ou un remote sur `dev.azure.com`,
`ssh.dev.azure.com` ou `*.visualstudio.com`, le run publie avec `az repos` au lieu de `gh`, avec
l'organisation, le projet et le dépôt que l'URL du remote nomme.

1. Installer le CLI Azure, puis `az extension add --name azure-devops`.
2. Se connecter une fois : `az login`, ou `az devops login --organization <URL de l'organisation>`
   avec un jeton d'accès personnel.

Le corps passe par un fichier (`--description=@<fichier>`), la pull request est liée au work item
de la story (`--work-items`) et son corps commence par `Fixes #<work item>` vers la branche par
défaut, ce qui clôt le work item à la fusion de la pull request, `#<work item>` sinon. Seul Azure
DevOps Services est atteint : `az` ne gère pas Azure DevOps Server. Un work item qu'Azure
DevOps refuse de lier n'empêche pas d'ouvrir la pull request : elle s'ouvre sans le lien, et la
raison du run le dit. Sous Windows, `az` ne s'exécute que depuis l'installeur du CLI Azure (MSI ou
winget) : skraft lance lui-même son Python, pour qu'aucun shell ne lise le titre, et refuse tout
autre `az.cmd` ou `az.bat` (pip, scoop). Le run lit la story dans son work item Azure Boards et
tient son avancement dans un seul commentaire sur lui, par le serveur MCP Azure DevOps de l'hôte
d'abord, `az` en repli, jamais quand vous ou l'hôte refusez un outil ([Forge](../reference/skraft-config.md#azure-devops-mcp-server-first-az-as-fallback)) ;
skraft ne revoit pas encore ses pull requests.
`skraft doctor` dit quelle forge un run utilise, sur sa ligne `forge`.

## Dépannage

| Message | Action |
|---|---|
| `<slug> has not completed; skraft publish opens the pull request of a completed run` | Terminer ou reprendre le run d'abord. |
| `pull request not opened: skraft-config.json sets publish.pullRequest to false; …` | `skraft publish`, ou répondre `ACCEPTED` au prochain run après avoir retiré la clé. |
| `pull request not opened: gh, the GitHub CLI, is not installed; …` | Installer `gh`, `gh auth login`, puis `skraft publish`. |
| `pull request not opened: az, the Azure CLI, is not installed; …` ou `the azure-devops extension of the Azure CLI is not installed; run az extension add --name azure-devops` | Installer `az` et l'extension, se connecter, puis `skraft publish`. |
| `HEAD is on <branche>, the branch the pull request would merge into` | Passer sur une branche de travail, puis `skraft publish`. |
| `HEAD is detached, on no branch to push` | `git switch -c <branche>`, puis `skraft publish`. |
| Le push échoue sur un mot de passe ou une passphrase | Configurer un agent ssh ou un gestionnaire d'identifiants : git ne demande jamais rien pendant un run. |
| `not published (consent): skraft-config.json sets publish.visuals to false` | Écrire `"visuals": true` sous `publish` si les captures ne montrent aucune donnée privée. |
| `skraft-visuals/manifest.json is missing or is not an object with a screenshots list` | Vérifier que le reporter est déclaré et que `commands.e2e` lance Playwright depuis la racine du composant. |

Tous les messages : [`skraft publish`](../reference/cli.md).

## Voir aussi

- [Phases — PUBLISH](../reference/phases.md#publish)
- [skraft-config.json — `publish`](../reference/skraft-config.md#publish)
- [Dossier de suivi et journal](../reference/run-journal.md) —
  `pull-request.md`, `issue-progress.md`, `qa-report.md`.
