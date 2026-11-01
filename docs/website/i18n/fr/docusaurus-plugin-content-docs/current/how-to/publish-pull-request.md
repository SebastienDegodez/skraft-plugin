---
title: "Publier la pull request d'un run"
description: "Consentir, préparer gh, laisser le run ouvrir sa pull request ou la publier avec skraft publish, suivre son issue."
persona: software-engineer
---

# Publier la pull request d'un run

Faites qu'un run terminé pousse sa branche et ouvre (ou mette à jour) sa pull request, avec sa
description rendue depuis le journal.

## Prérequis

- Un dépôt avec un remote GitHub, GitHub Enterprise ou Azure DevOps (`origin`, sinon le premier remote).
- `gh` installé (`az`, le CLI Azure, sur Azure DevOps : voir [Sur Azure DevOps](#azure-devops)) ; Git et ssh capables de pousser sans demander de mot de passe.
- Un travail sur une branche à vous, pas sur la branche de base.
- `skraft` est la commande que [`npm i -g @skraft/cli`](./install-on-a-host.mdx#skraft-command) met en place ; la ligne longue `node "<dossier du plugin>/engine/drivers/cli/skraft.mjs"` marche sans elle.

## 1. Connecter `gh` à la forge du remote

```console
$ gh auth login --hostname github.com
```

Remplacez `github.com` par l'hôte de votre GitHub Enterprise le cas échéant. skraft lance `gh`
avec `--repo <hôte>/<owner>/<dépôt>` d'après l'URL du remote. Le moteur lit l'issue et ouvre la pull request par `gh` seulement, jamais par un serveur MCP ([GitHub par gh](../reference/skraft-config.md#github-through-gh)). Consentement donné, une forge que `gh` ne peut pas joindre arrête le run dès son démarrage, avant le premier agent, par une question environment : réparez (`gh auth login`), puis répondez RETRY.

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
défaut).

:::note[Capture en attente d'un run réel]
Une capture de la pull request que le run a ouverte sur GitHub viendra après un run réel.
:::

### Ce que contient la description

La description commence par `Refs #<issue>`. What changes, Why, Decisions applied et Out of scope
s'affichent sous leur titre ; les autres sections (Tests, Quality gates, Review, Screenshots, Run
summary, AI disclosure) sont repliées dans un bloc `<details>`. Quality gates reste ouvert quand une
gate a échoué, Review quand un constat attend un humain.

Au-delà de la limite de la forge, les sections repliées vont dans un commentaire de la pull
request intitulé `skraft · run details` (`skraft · détails du run` pour une histoire en français).
Si ce commentaire ne peut pas être gardé, la pull request est tout de même publiée,
`pull-request.md` garde toute la description, et `skraft publish` garde les détails une fois la
cause corrigée.

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

## Sur Azure DevOps <!-- #azure-devops -->

Avec `forge` à `azure-devops` dans `skraft-config.json`, ou un remote sur `dev.azure.com`,
`ssh.dev.azure.com` ou `*.visualstudio.com`, le run publie avec `az repos` au lieu de `gh`.

1. Installer le CLI Azure, puis `az extension add --name azure-devops`.
2. Se connecter une fois : `az login`, ou `az devops login --organization <URL de l'organisation>`
   avec un jeton d'accès personnel.

La pull request est liée au work item de la story ; un work item qu'Azure DevOps refuse de lier
n'empêche pas d'ouvrir la pull request. Seul Azure DevOps Services est atteint, et sous Windows
`az` doit venir de l'installeur du CLI Azure (MSI ou winget). `skraft doctor` dit quelle forge un
run utilise, sur sa ligne `forge` ; le reste est dans
[Forge](../reference/skraft-config.md#azure-devops-through-az).

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

Tous les messages : [`skraft publish`](../reference/cli.md).

## Étapes suivantes <!-- #next-steps -->

- [Joindre les captures d'un frontend](./attach-screenshots.md)
- [Phases — PUBLISH](../reference/phases.md#publish)
- [skraft-config.json — `publish`](../reference/skraft-config.md#publish)
- [Dossier de suivi et journal](../reference/run-journal.md) —
  `pull-request.md`, `issue-progress.md`, `qa-report.md`.
