---
title: "Revoir une pull request avec skraft"
description: "Faire passer la pull request d'un autre par la revue DELIVER de skraft, sans run, lire le verdict, le garder en commentaire, revoir après un push."
persona: reviewer
---

# Revoir une pull request avec skraft

Obtenez sur une pull request que skraft n'a pas produite le verdict de sa revue DELIVER (lentilles,
réfutation, verdict calculé), et gardez-le si besoin dans un commentaire.

## Prérequis

- Le plugin `skraft` installé ; `skraft` est la commande que [`skraft install`](./install-on-a-host.mdx#skraft-command) met en place ; la ligne longue `node "<dossier du plugin>/engine/drivers/cli/skraft.mjs"` marche sans elle.
- Sur GitHub : `gh` installé et connecté à l'hôte du dépôt (`gh auth status`). Sur Azure Repos : `az` avec son extension `azure-devops`, connecté à l'organisation (Azure DevOps Services seulement).
- Un clone du dépôt, à la racine duquel vous lancez tout.

## 1. Extraire la pull request

```console
$ gh pr checkout 42
$ git fetch origin main
$ git status
```

Sur Azure Repos, extrayez-la avec `az repos pr checkout --id 42` à la place de `gh pr checkout 42`.

La copie de travail doit être sur le commit de tête de la pull request, Git doit connaître son
commit de base (`main` ici), et rien ne doit rester non commité hors de `.copilot-tracking/`.

Le workflow de revue, `skraft-config.json` et les règles du projet (`AGENTS.md`, `CLAUDE.md`,
`CONTRIBUTING.md`, `.github/copilot-instructions.md`, les ADR indexés) sont lus **au commit de
base** : une règle que la pull request modifie ne compte pas.

## 2. Lancer la revue

| Hôte | Commande |
|---|---|
| Claude Code | `/skraft review 42` : la revue tourne en arrière-plan, le panneau **Skraft** la suit |
| Copilot CLI | `/skraft review 42`, ou demandez de lancer le workflow `skraft-review` avec `pr` à `42` |
| VS Code, terminal | `skraft review --pr 42`, puis la boucle ci-dessous |

**En ligne de commande**, la revue confie ses lentilles à l'agent qui conduit, puis attend :

```text
skraft review #42: dispatch — start these 3 agents, one after the other, save each final reply as it is to its reply file, then record
agent 1: test-integrity-lens on the session's model
  prompt: Your brief is the file <…>. Read it whole and do what it asks. Your last message is the reply it asks for.
  reply: <…>
…
then: skraft review --pr 42 --record
```

Faites lancer chaque agent avec son `prompt` (par l'agent de votre chat, ou à la main), enregistrez
sa réponse finale telle quelle dans le fichier `reply`, puis lancez la commande `then:`. Répétez
tant que la sortie dit `dispatch` : le réfuteur est confié de la même façon.

## 3. Lire le verdict

```console
skraft review #42: NEEDS_REWORK, pass 1 — <résumé>
  to address: <ce qui renvoie le travail>
  details: <copie de travail>/.copilot-tracking/skraft-reviews/pr-42/reviews/verdict-1/verdict.yaml
```

| Statut | Signification |
|---|---|
| `APPROVED` | aucune remarque bloquante ne survit à la réfutation |
| `NEEDS_REWORK` | chaque ligne `to address:` est à transmettre à l'auteur |
| `BLOCKED` (`lens-inconclusive`) | une lentille n'a pas conclu : relancer la revue, ou lire sa réponse dans `verdict.yaml` |
| `stopped`, `refused` | la revue n'a pas démarré ou s'est arrêtée ; le code entre parenthèses dit pourquoi (Dépannage) |

`verdict.yaml` détaille chaque lentille, les findings réfutés et les notes.

:::note[Capture en attente d'un run réel]
Une capture de la sortie de `skraft review --pr` remplacera le bloc du verdict ci-dessus après
un run réel sur une pull request.
:::

## 4. Garder le verdict dans un commentaire (facultatif)

| Hôte | Commande |
|---|---|
| Claude Code | `/skraft review 42 --publish` |
| Copilot CLI | `/skraft review 42 --publish`, ou le workflow `skraft-review` avec `pr` à `42` et `publish` à `true` |
| Terminal | `skraft review --pr 42 --publish` |

skraft garde **un seul** commentaire, retrouvé par son marqueur `<sub>skraft-review pr=42</sub>`
et réécrit à chaque passe ; jamais une review GitHub ni une demande de changements. Sur Azure Repos, le commentaire est un
**fil** (thread), créé avec le statut *Closed* pour qu'une politique de branche « résolution des commentaires » n'attende
rien ; son premier commentaire est celui qui est réécrit. Jamais un vote, jamais une réponse. Il demande
votre accord une fois par dépôt (terminal, dialogue, ou confirmation de Copilot) et le garde dans
votre `~/.skraft/config.json`. Une équipe peut trancher pour tous avec `publish.reviewComment`
dans le `skraft-config.json` de la branche de base
([skraft-config.json](../reference/skraft-config.md#publish)). Sans accord,
rien n'est posté ; `comment.md`, à côté de `verdict.yaml`, garde le texte.

:::note[Capture en attente d'un run réel]
Une capture de la pull request et de son commentaire de revue sur GitHub viendra après un run
réel.
:::

## 5. Revoir après un nouveau push

```console
$ gh pr checkout 42
```

Relancez la revue : c'est la passe suivante (`verdict-2/`). Une lentille dont les entrées n'ont
pas bougé et qui n'avait rien trouvé est reprise sans être relancée.

## Dépannage

| Code | Action |
|---|---|
| `forge-unavailable` | Installer `gh` et le connecter (`gh auth login --hostname <hôte>`) ; sur Azure Repos, installer `az` et son extension et le connecter (`az login`) ; vérifier que la copie a un remote vers la forge. |
| `pr-not-found`, `pr-unreadable` | Vérifier le numéro, et que `gh repo set-default` désigne le bon dépôt. Sur Azure Repos, la pull request doit être dans le projet et le dépôt que nomme le remote Git. |
| `pr-not-checked-out` | `gh pr checkout <numéro>` (`az repos pr checkout --id <numéro>` sur Azure Repos), puis relancer. |
| `pr-base-missing` | `git fetch origin <base>`, puis relancer. |
| `working-copy-dirty` | Commiter ou mettre de côté les changements hors de `.copilot-tracking/`. |
| `workflow-invalid` | Le `.skraft/review.skraft.dot` de la base retire un nœud obligatoire : le corriger sur la branche de base. |
| `pipeline-locked` | Une autre session revoit cette pull request : attendre qu'elle finisse. |
| `journal-unverifiable` | La revue a commencé sur une autre machine : `skraft journal adopt --pr <numéro>` dans votre terminal. |
| `not-recorded` | Des agents confiés n'ont pas de réponse : finir la boucle, puis `--record`. |

## Étapes suivantes <!-- #next-steps -->

- [`skraft review`](../reference/cli.md) — règles de chaque étape, sortie
  `--json`.
- [Workflow `skraft-review`](../reference/hosts.md#skraft-review)
- [Ajouter une lentille à une revue](./customise-review.md) — la
  revue suit `.skraft/review.skraft.dot` s'il existe.
- [Gates : revue](../reference/gates.md#review-run) — lentilles, réfutation,
  verdict.
