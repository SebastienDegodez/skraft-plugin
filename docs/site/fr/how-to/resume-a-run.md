---
layout: doc
lang: fr
title: "Reprendre ou débloquer un run"
description: "Reprendre un run interrompu sans relancer l'agent déjà fini, changer de pipeline actif et lever chaque code de refus ou de blocage du moteur."
persona: software-engineer
---

# Reprendre ou débloquer un run

**But** : relancer un run arrêté là où il s'est arrêté, ou comprendre pourquoi le moteur refuse d'avancer.

Un **run** est le passage d'une story dans le pipeline, identifié par un **slug** en kebab-case (`checkout`). Son état est recalculé à partir de son journal, `.copilot-tracking/skraft-plans/<slug>/events.jsonl`. Le **pipeline actif** est le slug écrit dans `.copilot-tracking/skraft-plans/.active-slug` ; le moteur ne le devine jamais. Chaque worktree a le sien.

## Prérequis

- Un run déjà démarré dans cette copie de travail.
- Pour la ligne de commande : `skraft` désigne `node "<dossier du plugin>/engine/drivers/cli/skraft.mjs"`, où `<dossier du plugin>` est le dossier où l'hôte a installé le plugin skraft.

## 1. Voir où en est le run

```
skraft status
```

Vous voyez :

```
skraft checkout: blocked
RESEARCH  open
agent: solution-researcher (research, attempt 1)
…
```

La dernière ligne donne la raison du blocage. `skraft status --json` donne la même vue en JSON.

Dans Claude Code, `/skraft` (ou `/skraft status`) donne les mêmes informations dans un autre format : `skraft checkout — blocked`, `▶ RESEARCH`, puis la raison, puis l'agent et `cost: $…`. Voir [la référence]({{ "/fr/reference/cli" | relative_url }}).

## 2. Reprendre après une interruption

La reprise relit le journal et repart de la première étape non terminée. Un agent dont les sorties sont déjà remplies n'est pas relancé. La base journalisée au premier init est gardée.

| Hôte | Comment reprendre |
|---|---|
| Claude Code | `/skraft <slug>` avec le slug du pipeline actif, ou demander au modèle d'appeler `mcp__skraft__run_pipeline` **sans** slug. `/skraft` seul affiche l'état, il ne relance rien. |
| GitHub Copilot CLI | Lancer le workflow `skraft-pipeline` sans `slug`. |

Claude Code répond `skraft <slug> started — progress in the Skraft pane.` Le panneau « Skraft » montre les phases, l'agent en cours et le journal de progression.

> **À venir.** La reprise sous VS Code est prévue au lot 10.

## 3. Changer de pipeline actif

Le moteur ne passe jamais d'un slug à un autre de lui-même. Pour travailler sur un autre slug, faites un init explicite :

```
skraft init paiement-carte
```

Réponse : `paiement-carte is the active pipeline`. La ligne de commande ne lance aucun agent : le slug devient seulement le pipeline actif. Reprenez ou démarrez ensuite le run depuis l'hôte (section 2).

Dans Claude Code, `/skraft paiement-carte` fait les deux à la fois : il rend le slug actif et lance le run, qui reprend si le slug a déjà un journal et démarre sinon. Réponse : `skraft paiement-carte started — progress in the Skraft pane.`

## 4. Lever un refus ou un blocage

Un **refus** (`refused`) : le moteur n'a rien fait. Un **blocage** (`blocked`) : le run s'est arrêté et le journal le dit. Le code apparaît dans la notification de fin du mod Claude Code (`skraft checkout: blocked (missing-outputs) — …`), dans le retour et le journal du workflow Copilot, et dans le champ `code` de `skraft gate --json`. `skraft status` ne l'affiche pas : il donne le statut et la raison.

| Symptôme | Code | Action |
|---|---|---|
| `journal tampered: events.jsonl line N …; restore the file or start a new slug` | `journal-tampered` | Le journal a été modifié à la main : la chaîne de hachage est cassée à la ligne N. Restaurez le fichier (par exemple depuis Git ou une sauvegarde) ou démarrez un nouveau slug. N'essayez pas de réparer la ligne. |
| `<slug>: another run wrote events.jsonl meanwhile; run again once it stops` | `journal-changed` | Un autre run (autre terminal, autre session) écrit dans le même journal. Attendez qu'il s'arrête, puis reprenez. |
| L'hôte n'a pas pu lancer l'agent (plugin absent ou désactivé, lancement refusé) | `agent-unavailable` | Installez ou activez le plugin skraft, acceptez le lancement de l'agent, puis reprenez. La tentative n'est pas consommée : la reprise relance le même agent. |
| `<agent> stopped without finishing: …` | `agent-failed` | L'agent s'est arrêté sans remplir ses sorties. Reprenez : le moteur relance la même tentative. |
| `<agent> left required outputs missing after 2 attempts: <chemins>` | `missing-outputs` | L'agent a été relancé une fois avec la liste des fichiers manquants, sans résultat. Une reprise rend le même blocage. Lisez les chemins donnés, puis démarrez un nouveau slug. |
| `… has no merge base with <ref>; set baseBranch in skraft-config.json or pass --base <ref>` | `base-unresolved` | Un dépôt n'a pas de merge-base avec la ref. Écrivez `baseBranch` (global ou sur le composant) ou passez `--base <ref>` à l'init. |
| `<erreur>; the components of skraft-config.json need Git for their base` | `source-control-unavailable` | Git ne tourne pas alors que la config liste des composants. Installez Git ou mettez-le dans le PATH. |
| `no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug` | `no-active-pipeline` | Aucun pipeline actif. Démarrez-en un : `skraft init <slug>` ou `/skraft <slug>`. |
| `the active pipeline of this working copy is <a>, not <b>; switch with an explicit init` | `slug-mismatch` | Garde-fou interne : aucune commande actuelle ne le déclenche, car `/skraft <slug>`, `skraft init <slug>` et le workflow avec `slug` font l'init avant de lancer et basculent donc de pipeline. Si vous le voyez, faites un init explicite du slug voulu. |
| `<slug> has no journal (events.jsonl); start it with an explicit init` | `not-initialised` | Le pipeline actif n'a pas de journal. Faites un init explicite. |
| `skraft-config.json is invalid: <toutes les erreurs>` | `config-invalid` | Corrigez chaque erreur listée (voir [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }})), puis relancez. |
| `slug must be kebab-case, got "Checkout_V2"` | `invalid-slug` | Choisissez un slug en minuscules et tirets : `checkout-v2`. |
| `--base must be a git ref, got "…"` | `invalid-base` | Passez une ref Git sans espace et qui ne commence pas par `-`. |
| `skraft-config.json lists no component; run skraft init to detect them` | `no-components` | `skraft gate` n'a rien à lancer. Lancez `skraft init` pour détecter les composants. |

Dans Claude Code, un init refusé s'affiche ainsi : `skraft <slug>: not started — <raison>`.

## Voir aussi

- [Référence du journal]({{ "/fr/reference/run-journal" | relative_url }}) — le dossier de suivi, les événements et tous les codes.
- [État et reprise]({{ "/fr/explanation/hve-core" | relative_url }}) — pourquoi le journal est chaîné.
- [Référence de la ligne de commande]({{ "/fr/reference/cli" | relative_url }})
