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
avec `--repo <hôte>/<owner>/<dépôt>` d'après l'URL du remote. Le moteur lit l'issue et ouvre la pull request par `gh` seulement, jamais par un serveur MCP ([GitHub par gh](../reference/skraft-config.md#github-through-gh)). Consentement accepté, une forge que `gh` ne peut pas joindre refuse le run dès son démarrage, avant le premier agent et sans rien demander : réparez (`gh auth login`), puis relancez le run.

## 2. Donner le consentement

`/skraft-init` demande si skraft peut pousser la branche, ouvrir ou mettre à jour sa pull request,
et tenir à jour un commentaire sur l'issue de la story. Répondez oui, et il écrit la réponse dans
`skraft-config.json`. Tant que ce n'est pas réglé là, un run qui publierait est refusé
(`configuration-incomplete`) avant son premier agent :

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

## 3. Laisser le run publier

En fin de run, la phase PUBLISH fait écrire le résumé à `pr-writer`, puis le nœud `publish` pousse
la branche (jamais en force, jamais la base ni la branche par défaut) et ouvre la pull request,
sur la base du run (`baseBranch`, `--base`, sinon `main`). Une pull request déjà ouverte pour la
branche est mise à jour.

Résultat : la notification `skraft <slug>: done — PUBLISH closed`, et la pull request sur la
forge, qui commence par `Refs #<issue>` (`Closes #<issue>` quand elle vise la branche par
défaut).

![GitHub : pull request brouillon n° 4 « Refuse a driver whose licence is suspended », 11 commits de suspended-licence vers main, 18 fichiers modifiés ; sa description commence par Closes #2, puis What changes (HTTP, Domain, Application, Specs) et Why](/img/screenshots/shared/github-pr-published.png)

*Figure 1 — La pull request qu'un run a ouverte sur le [dépôt de démonstration](https://github.com/SebastienDegodez/skraft-demo-meetup/pull/4), en brouillon.*

### Ce que contient la description

La description commence par `Refs #<issue>` ; ce qui décide s'affiche sous des titres, le reste est replié et s'ouvre seul sur une porte en échec ou un constat à corriger ou à trancher. Elle est écrite dans la langue de la story ; au-delà de la limite de la forge, les sections repliées vont dans un commentaire `skraft · détails du run`. Chaque section, à quoi elle sert et quand agir : [Pull request et commentaire de revue](../reference/pull-request.md#description).

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
close, revue renvoyée et fin de run, dans la langue de la story, la pull request nommée une seule
fois par son URL. Son dernier corps reste dans
`.copilot-tracking/skraft-plans/<slug>/issue-progress.md`. Chaque ligne de ce commentaire : [Commentaires d'issue](../reference/issue-comments.md#progress).

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
