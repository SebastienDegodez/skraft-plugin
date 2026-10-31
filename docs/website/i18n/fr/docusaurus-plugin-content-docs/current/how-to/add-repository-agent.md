---
title: "Ajouter un agent du dépôt au pipeline"
description: "Confier une étape du pipeline à un agent écrit dans votre dépôt : écrire son fichier pour chaque hôte, l'ajouter comme nœud du workflow éjecté avec ses sorties et ses chemins d'écriture, le placer avant les gates, et vérifier avec check, diff et doctor."
persona: tech-lead
---

# Ajouter un agent du dépôt au pipeline

**But** : faire exécuter à chaque run une étape propre à votre équipe (par exemple mettre à jour
le guide utilisateur), par un agent écrit dans votre dépôt.

Pour une relecture plutôt qu'une étape qui produit :
[Ajouter une lentille à une revue](./customise-review.md).

## Prérequis

- Un dépôt configuré, Git, et un terminal à la racine de la copie de travail ; `skraft` est la commande que [`skraft install`](./install-on-a-host.mdx#skraft-command) met en place ; la ligne longue `node "<dossier du plugin>/engine/drivers/cli/skraft.mjs"` marche sans elle.
- Le workflow copié dans `.skraft/pipeline.skraft.dot`
  ([Copier et adapter le workflow](./eject-workflow.md)).

## 1. Écrire l'agent

Choisissez un identifiant kebab-case qu'aucun agent de skraft ne porte : à identifiant égal,
l'agent du plugin est pris en premier. Créez son fichier pour chaque hôte que l'équipe utilise :

| Hôte | Fichier |
|---|---|
| Claude Code | `.claude/agents/user-docs-writer.md` |
| Copilot CLI, VS Code | `.github/agents/user-docs-writer.agent.md` (ou `.md`) |

```markdown
---
name: user-docs-writer
description: Met à jour le guide utilisateur sous docs/user pour la story du run.
---
Lis le brief, mets à jour docs/user pour ce que la story change, puis écris le résumé demandé.
```

## 2. Ajouter le nœud au workflow

Dans `.skraft/pipeline.skraft.dot`, déclarez un nœud `shape=box` qui nomme l'agent, puis
branchez-le. Un agent qui modifie la copie de travail se place **avant** `gates`, pour que ses
changements passent les gates et la revue DELIVER :

```text
user_docs [shape=box, agent="user-docs-writer", outputs="changes/{date}/user-docs-{slug}.md", writes="docs/user"]

deliver -> user_docs -> gates
```

et retirez l'arête `deliver -> gates` qu'elle remplace.

| Attribut | Effet |
|---|---|
| `agent` | l'identifiant de l'agent, cherché dans le plugin, puis dans `.claude/agents/` ou `.github/agents/` |
| `outputs` | les fichiers que l'agent doit remplir, relatifs au dossier de suivi du run ; `{date}` et `{slug}` sont remplis au lancement |
| `writes` | les chemins de la copie de travail qu'il peut modifier ; sans `writes`, il n'écrit que dans le dossier de suivi |
| `max_attempts` | tentatives par passage ; défaut 3 |
| `model` | sa famille de modèle ([Choisir les modèles des agents](./choose-models.md)) |

Le brief que le moteur donne à l'agent liste ces sorties, les chemins qu'il peut écrire et les
sorties des autres étapes à lire. Après chaque tentative, le moteur vérifie que chaque sortie est
remplie et que rien n'a été écrit hors de ces chemins.

## 3. Vérifier

```console
$ skraft workflow check
$ skraft workflow diff
$ skraft doctor
```

Résultat attendu :

```text
.skraft/pipeline.skraft.dot is valid: phases RESEARCH, DESIGN, DISTILL, DELIVER, PUBLISH
+ node user_docs (agent user-docs-writer)
+ edge deliver -> user_docs
+ edge user_docs -> gates
- edge deliver -> gates
.skraft/pipeline.skraft.dot: 4 changes from the skraft 2.0.0-alpha.19 workflow
```

Dans les tableaux de `skraft doctor`, une ligne `user_docs  user-docs-writer` donne la famille et
le modèle sur lesquels l'agent tournera sur chaque hôte.

Commitez `.skraft/` et les fichiers de l'agent : l'étape tourne au prochain run.

## Dépannage

| Message | Action |
|---|---|
| `node user_docs: agent user-docs-writer not found in the plugin, .claude/agents/ or .github/agents/` | Créer le fichier de l'agent au nom exact de l'identifiant, pour l'hôte utilisé. |
| `user_docs reaches the exit without passing gates; keep the run going through gates, or skip gates with unlock="<reason>"` | Le nœud est placé après les gates : le déplacer avant `gates`. |
| `user_docs reaches the exit without passing mandatory node deliver_review; …` | Même cause : le nœud contourne la revue DELIVER. |
| `node user_docs: attribute <clé> is not supported on a box node (supported: …)` | N'utiliser que les attributs listés à l'étape 2. |
| `out of write scope: <chemin>` dans le journal | L'agent a écrit hors de `writes` : élargir `writes`, ou resserrer son prompt. |
| `missing-outputs` | L'agent n'a pas rempli une sortie de `outputs` après ses tentatives : corriger son prompt, puis démarrer un nouveau slug. |
| L'agent du plugin tourne à la place du vôtre | Un agent de skraft porte le même identifiant : renommer le vôtre. |

## Voir aussi

- [Le workflow DOT](../reference/workflow-dot.md#node-attributes) — tous les
  attributs d'un nœud agent.
- [Copier et adapter le workflow](./eject-workflow.md)
- [Adapter skraft : ce que coûte chaque réglage](../explanation/customisation-trade-offs.md)
