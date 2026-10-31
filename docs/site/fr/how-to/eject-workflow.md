---
layout: doc
lang: fr
title: "Copier et adapter le workflow"
description: "Copier le workflow du plugin dans .skraft/ avec skraft workflow eject, l'adapter (sauter une gate verrouillée avec sa raison, changer une boucle, retirer une lentille), le valider avec check, le comparer avec diff, le mettre à jour après une montée de version ou revenir au workflow du plugin."
persona: tech-lead
---

# Copier et adapter le workflow

**But** : faire suivre aux runs de votre dépôt une version adaptée du pipeline ou de la revue
DELIVER, et la garder à jour avec le plugin.

## Prérequis

- Un dépôt configuré, Git, et un terminal à la racine de la copie de travail ; `skraft` est la commande que [`skraft install`]({{ "/fr/how-to/install-on-a-host" | relative_url }}#skraft-command) met en place ; la ligne longue `node "<dossier du plugin>/engine/drivers/cli/skraft.mjs"` marche sans elle.

## 1. Copier le workflow

| Pour adapter… | Commande | Fichier écrit |
|---|---|---|
| le pipeline (phases, revues DESIGN et DISTILL, gates, mutation, publication) | `skraft workflow eject` | `.skraft/pipeline.skraft.dot` |
| la revue DELIVER, aussi lancée par `skraft review --pr` | `skraft workflow eject review` | `.skraft/review.skraft.dot` |

```text
.skraft/pipeline.skraft.dot holds the skraft 2.0.0-alpha.19 pipeline; the run follows it
```

La copie porte `skraft_version="2.0.0-alpha.19"` dans son `graph [...]`. Dès qu'elle existe,
chaque run de la copie de travail la suit. Une copie existante n'est jamais écrasée.

## 2. Modifier la copie

Quelques modifications courantes, dans `.skraft/pipeline.skraft.dot` :

| Pour… | Écrire |
|---|---|
| sauter une gate verrouillée (`gates`, `mutation`) | `unlock="<raison>"` sur le nœud, qui reste en place : `mutation [shape=parallelogram, gate="mutation", goal_gate=true, locked=true, unlock="aucun outil de mutation pour ce composant"]` |
| permettre plus de reprises d'une boucle | changer `max_visits` sur l'arête retour : `design_review -> design [label="NEEDS_REWORK", max_visits=3]` |
| retirer une lentille non obligatoire | supprimer son nœud `shape=note` et ses deux arêtes |
| ajouter une lentille de l'équipe | [Ajouter une lentille à une revue]({{ "/fr/how-to/customise-review" | relative_url }}) |
| ajouter une étape confiée à un agent du dépôt | [Ajouter un agent du dépôt au pipeline]({{ "/fr/how-to/add-repository-agent" | relative_url }}) |
| changer la famille de modèle d'un agent | `model="<famille>"` sur son nœud ([Choisir les modèles des agents]({{ "/fr/how-to/choose-models" | relative_url }})) |

La raison d'un `unlock` est reprise dans le journal et dans la pull request du run. Les fan-in
des revues, l'appel `deliver_review` et, dans la revue, `verdict`, `test_integrity` et
`architecture_boundaries` sont obligatoires : aucune copie ne peut les retirer ni les contourner.

## 3. Valider et comparer

```text
skraft workflow check
skraft workflow diff
```

Résultat attendu, pour une gate de mutation sautée :

```text
.skraft/pipeline.skraft.dot is valid: phases RESEARCH, DESIGN, DISTILL, DELIVER, PUBLISH; mutation is unlocked and skipped: aucun outil de mutation pour ce composant
~ node mutation: unlock none → aucun outil de mutation pour ce composant
.skraft/pipeline.skraft.dot: 1 changes from the skraft 2.0.0-alpha.19 workflow
```

Commitez `.skraft/` : toute l'équipe suit le même workflow.

## 4. Mettre la copie à jour après une montée de version du plugin

Après la mise à jour du plugin, `diff` signale l'écart de version en première ligne :

```text
skraft_version 2.0.0-alpha.17 → 2.0.0-alpha.19
~ edge design_review -> design: max_visits 1 → 3
.skraft/pipeline.skraft.dot carries skraft_version 2.0.0-alpha.17, this plugin is 2.0.0-alpha.19; 1 changes from the skraft 2.0.0-alpha.19 workflow
```

Les lignes suivantes mêlent vos modifications et celles du nouveau workflow. Pour repartir du
nouveau workflow :

1. Gardez la sortie de `skraft workflow diff` : elle liste vos modifications.
2. Renommez la copie (`.skraft/pipeline.skraft.dot.old`), puis `skraft workflow eject`.
3. Reportez vos modifications dans la nouvelle copie.
4. `skraft workflow check`, puis `skraft workflow diff` : la ligne `skraft_version` a disparu et
   seules vos modifications restent. Supprimez l'ancienne copie et commitez.

## 5. Revenir au workflow du plugin

Supprimez la copie (`.skraft/pipeline.skraft.dot` ou `.skraft/review.skraft.dot`) et commitez.
`skraft workflow diff` répond alors `the working copy has neither .skraft/pipeline.skraft.dot nor
.skraft/review.skraft.dot; the plugin's run as shipped …`.

## Dépannage

| Message | Action |
|---|---|
| `.skraft/pipeline.skraft.dot already exists; edit it, or remove it` | Modifier la copie existante, ou la renommer avant de copier (étape 4). |
| `locked node mutation is missing; keep it with unlock="<reason>" to skip it` | Remettre le nœud et ajouter `unlock="<raison>"`. |
| `<nœud> reaches the exit without passing gates; keep the run going through gates, or skip gates with unlock="<reason>"` | Un nœud ajouté après les gates les contourne : le placer avant `gates`. |
| `loop a -> b -> a has no max_visits` | Ajouter `max_visits` sur une arête de la boucle. |
| `mandatory node … is missing; this node is mandatory and cannot be removed` | Remettre le nœud obligatoire. |
| `the workflow has no node <id> any more; restore the workflow the run started with` | Un run en cours se trouvait sur le nœud retiré : remettre le nœud le temps de finir ce run, ou démarrer un nouveau slug. |

## Voir aussi

- [Le workflow DOT]({{ "/fr/reference/workflow-dot" | relative_url }}) — syntaxe, règles de
  validité, [nœuds verrouillés]({{ "/fr/reference/workflow-dot" | relative_url }}#locked-nodes) et
  [obligatoires]({{ "/fr/reference/workflow-dot" | relative_url }}#mandatory-nodes).
- [`skraft workflow`]({{ "/fr/reference/cli" | relative_url }}) — sorties et codes de sortie.
- [Adapter skraft : ce que coûte chaque réglage]({{ "/fr/explanation/customisation-trade-offs" | relative_url }})
