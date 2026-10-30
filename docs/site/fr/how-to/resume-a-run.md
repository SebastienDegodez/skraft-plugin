---
layout: doc
lang: fr
title: "Reprendre ou débloquer un run"
description: "Reprendre un run interrompu sans relancer l'agent déjà fini, changer de pipeline actif, et lever les refus et blocages les plus courants."
persona: software-engineer
---

# Reprendre ou débloquer un run

**But** : relancer un run arrêté là où il s'est arrêté, ou lever ce qui l'empêche d'avancer.

## Prérequis

- Un run déjà démarré dans cette copie de travail (un slug, son journal
  `.copilot-tracking/skraft-plans/<slug>/events.jsonl`).
- Pour la ligne de commande, `skraft` est la commande que [`skraft install`]({{ "/fr/how-to/install-on-a-host" | relative_url }}#skraft-command) met en place ; la ligne longue `node "<dossier du plugin>/engine/drivers/cli/skraft.mjs"` marche sans elle. Lancez-la depuis la racine de la copie de travail.

## 1. Voir où en est le run

```text
skraft status
```

```text
skraft checkout: blocked
RESEARCH  closed
DESIGN  open
agent: solution-architect (design, attempt 1)
solution-architect stopped without finishing: …
```

La dernière ligne donne la raison. Dans Claude Code, `/skraft` montre la même vue dans le
panneau **Skraft**. Si le statut est `waiting`, le run attend une réponse :
[Répondre à une question du run]({{ "/fr/how-to/answer-a-question" | relative_url }}).

## 2. Reprendre le run

La reprise relit le journal et repart de la première étape non terminée ; un agent dont les
sorties sont déjà remplies n'est pas relancé, et la base journalisée reste.

| Hôte | Reprendre le pipeline actif |
|---|---|
| Claude Code | `/skraft <slug>` avec le slug du pipeline actif (`/skraft` seul affiche l'état sans rien relancer) |
| Copilot CLI | demander à `skraft:skraft-orchestrator` de reprendre : il lance le workflow `skraft-pipeline` sans `slug` ; un workflow en pause se reprend depuis `/workflows` |
| VS Code, SDK Copilot | `node "<dossier du plugin>/engine/drivers/copilot-sdk/skraft-run.mjs"` sans slug |
| VS Code, sans SDK | demander à l'agent orchestrateur de reprendre : il lance `skraft next`, ou `skraft record` si des réponses d'agent attendent |

Claude Code répond `skraft <slug> started — progress in the Skraft pane.` ; `skraft status`
montre ensuite la phase reprise.

## 3. Changer de pipeline actif

Le moteur ne change jamais de slug de lui-même. Faites un init explicite :

```text
skraft init paiement-carte
```

Réponse : `paiement-carte is the active pipeline`. La ligne de commande ne lance aucun agent :
reprenez ou démarrez ensuite le run depuis l'hôte (étape 2). Dans Claude Code,
`/skraft paiement-carte` fait les deux à la fois.

## Dépannage

Le code s'affiche dans la notification de fin du mod Claude Code
(`skraft checkout: blocked (missing-outputs) — …`), dans le retour du workflow Copilot et dans
`skraft gate --json`.

| Code | Action |
|---|---|
| `agent-failed` | Reprendre : la même tentative est relancée. |
| `agent-unavailable` | Installer ou activer le plugin, accepter le lancement de l'agent, puis reprendre ; la tentative n'est pas consommée. |
| `pipeline-locked` | Une autre session conduit le run : la laisser finir. Un bail non renouvelé depuis 2 minutes est repris par la reprise suivante. |
| `journal-changed` | Un autre terminal écrit dans le même journal : attendre qu'il s'arrête, puis reprendre. |
| `journal-tampered` | `events.jsonl` a été modifié à la main : restaurer le fichier (Git, sauvegarde) ou démarrer un nouveau slug. Ne pas réparer la ligne. |
| `journal-unverifiable` | Le run vient d'une autre machine : `skraft journal adopt`, puis reprendre. |
| `no-active-pipeline`, `not-initialised` | `skraft init <slug>` ou `/skraft <slug>`. |
| `config-invalid` | Corriger chaque erreur listée ([Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }})), puis reprendre. |
| `base-unresolved` | Écrire `baseBranch` dans `skraft-config.json` ou passer `--base <ref>` au premier init. |
| `missing-outputs`, `loop-ceiling`, `environment`, `stopped` | Définitif pour ce slug : lire la raison dans le journal, corriger la cause, démarrer un nouveau slug. |

Tous les codes, leur message et leur action :
[Statuts et codes]({{ "/fr/reference/run-journal" | relative_url }}#statuses-and-codes).

## Voir aussi

- [Répondre à une question du run]({{ "/fr/how-to/answer-a-question" | relative_url }})
- [Hôtes]({{ "/fr/reference/hosts" | relative_url }}#at-a-glance) — démarrer, répondre et suivre
  sur chaque hôte.
- [Dossier de suivi et journal]({{ "/fr/reference/run-journal" | relative_url }})
- [État et reprise]({{ "/fr/explanation/event-journal" | relative_url }}) — pourquoi le journal est chaîné.
