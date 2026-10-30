---
layout: doc
lang: fr
title: "Répondre à une question du run"
description: "Répondre à la question qu'un run attend (ratifier un ADR, consentir à publier, réparer la machine, débloquer un agent, traiter les mutants) depuis Claude Code, Copilot ou un terminal, et savoir ce que devient un refus."
persona: software-engineer
---

# Répondre à une question du run

**But** : donner la décision humaine qu'un run attend, pour qu'il reparte.

Un run qui pose une question **attend** : il ne fait plus rien tant que personne n'a répondu, et
le relancer repose la même question, sans relancer d'agent.

## Prérequis

- Un run au statut `waiting` (`skraft status`, ou le panneau **Skraft**).
- Pour la ligne de commande : un terminal interactif à la racine de la copie de travail ;
  `skraft` désigne `node "<dossier du plugin>/engine/drivers/cli/skraft.mjs"`.

## 1. Lire la question et sa clé

```text
skraft status
```

```text
skraft checkout: waiting
…
question: adr-ratification (adr)
answer: skraft decide adr-1 RATIFIED|REJECTED (--reason <text> with REJECTED)
Ratify the Proposed ADRs docs/adr/adr-001-card-provider.md? RATIFIED marks them Accepted; REJECTED sends DESIGN back with your reason.
```

La ligne `answer:` donne la clé (`adr-1`) et les réponses permises :

| Question | Réponses | Raison obligatoire |
|---|---|---|
| `adr-ratification` | `RATIFIED`, `REJECTED` | avec `REJECTED` |
| `publish-consent`, `reporting-consent` | `ACCEPTED`, `DECLINED` | — |
| `review-consent` (`skraft review --pr --publish`, en-tête `Review comment`) | `ACCEPTED`, `DECLINED` | — |
| `environment` | `RETRY` (après avoir réparé la machine), `ABORT` | — |
| `mutation-plan` | `APPLY`, une consigne à vous, ou `STOP` | — |
| `blocked` | une consigne pour l'agent, ou `STOP` | — |

Ce que chaque réponse déclenche : [Questions à un humain]({{ "/fr/reference/run-journal" | relative_url }}#human-questions).

## 2. Répondre depuis votre hôte

### Claude Code

1. Choisissez une option dans la boîte de dialogue que le mod ouvre (en-tête `ADR`,
   `Pull request`, `Environment`…).
2. Pour `REJECTED`, une deuxième boîte demande la raison : tapez-la sous **Other**.
3. Pour une question `blocked` ou `mutation-plan`, tapez votre consigne sous **Other**, ou
   choisissez `STOP` (`APPLY`).

Boîte fermée, le run attend. Répondez plus tard par un bouton du panneau **Skraft**, ou dans la
conversation :

```text
/skraft decide adr-1 REJECTED prendre le prestataire déjà sous contrat
```

Les mots après la réponse forment la raison ; pour une question `blocked`, tous les mots après la
clé forment la consigne. `/skraft decide` enregistre la réponse, puis reprend le run.

### GitHub Copilot CLI

1. Copilot pose la question une seule fois, dans le chat : choisissez une option, ou tapez votre
   consigne.
2. Pour `REJECTED`, tapez la raison dans le champ qui suit.

Si la question n'a pas pu être posée (mode `autopilot`, pas de boîte de dialogue) ou que vous
l'avez fermée, le workflow écrit `Waiting for you — <question>` et se met en pause. Au choix :

- reprenez le workflow depuis `/workflows` : la question est reposée ;
- demandez à Copilot, dans le chat, de vous poser la question skraft en attente : l'outil
  `skraft_decide` vous la pose dans la boîte de dialogue, puis répond
  `Recorded: … Resume the paused skraft-pipeline run (/workflows).` Reprenez alors le workflow.

Le canvas `skraft-pipeline` montre la question mais ne prend aucune réponse.

### VS Code ou terminal

```text
skraft decide adr-1 REJECTED --reason "prendre le prestataire déjà sous contrat"
```

Le terminal demande `skraft decide: record REJECTED for adr-1? [y/N]` : tapez `y`. Pour une
question `blocked`, la consigne va entre guillemets : `skraft decide design-1 "utiliser la
passerelle bancaire"`. Puis reprenez le run : `skraft-run.mjs` de nouveau (SDK Copilot), ou
demandez à l'agent orchestrateur de relancer `skraft next`.

## 3. Vérifier que le run est reparti

```text
skraft status
```

Le statut n'est plus `waiting`. `skraft report` liste chaque réponse donnée, avec la façon dont
elle a été enregistrée (`host`, `decide`, `host-confirmed`, `cli-tty`).

## Ce que devient un refus

- **`REJECTED` sur un ADR** : l'architecte repasse DESIGN avec votre raison. Au-delà de 3
  rejets, le run pose la question `blocked` sur `design` : une consigne relance l'architecte,
  `STOP` termine le run (`loop-ceiling`).
- **`DECLINED` sur un consentement** : la réponse est écrite dans `skraft-config.json`
  (`publish.pullRequest` ou `publish.visuals`) et n'est plus redemandée ; le run continue en
  local ([Publier la pull request d'un run]({{ "/fr/how-to/publish-pull-request" | relative_url }})).
- **`review-consent`** : la réponse (`ACCEPTED` ou `DECLINED`) est gardée une fois par dépôt dans
  votre propre `~/.skraft/config.json` (`reviewComments`), pas dans `skraft-config.json` ; un
  `DECLINED` laisse le commentaire de revue hors de la pull request.
- **`ABORT`** : le run se termine `blocked` (code `environment`) ; démarrez un nouveau slug une
  fois la machine réparée.
- **`STOP`** : le run se termine `blocked`, définitivement pour ce slug.

## Dépannage

Une réponse refusée n'enregistre rien ; le run attend toujours.

| Message | Action |
|---|---|
| `no question adr-2; waiting: adr-1` | Reprendre la clé que le message nomme. |
| `adr-1 was already answered RATIFIED` | Rien à faire : reprendre le run. |
| `REJECTED needs the reason, which goes back to the agent` | Ajouter `--reason "…"`. |
| `the answer must be one of RATIFIED, REJECTED` | Écrire une des options. |
| `skraft decide records a person's answer: run it yourself in an interactive terminal; nothing was recorded` | Lancer la commande vous-même, dans un terminal interactif. |
| `Refused: …; nothing was recorded.` (Copilot) | Répondre par `skraft decide` dans un terminal, puis reprendre le workflow. |

## Voir aussi

- [`skraft decide`]({{ "/fr/reference/cli" | relative_url }}) — arguments, clés, messages.
- [Hôtes]({{ "/fr/reference/hosts" | relative_url }}) — boîte de dialogue, panneau,
  `skraft_decide` et canvas, hôte par hôte.
- [Phases]({{ "/fr/reference/phases" | relative_url }}#human-questions) — qui pose chaque
  question.
- [Reprendre ou débloquer un run]({{ "/fr/how-to/resume-a-run" | relative_url }})
