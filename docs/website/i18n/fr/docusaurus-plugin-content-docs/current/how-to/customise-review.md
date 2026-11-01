---
title: "Ajouter une lentille à une revue"
description: "Ajouter une lentille du dépôt à la revue de conception ou DELIVER, changer la famille de modèle d'une lentille, vérifier avec check et diff."
persona: tech-lead
---

# Ajouter une lentille à une revue

Faites relire chaque run par une lentille de votre équipe (par exemple un modèle de menaces), en
plus des lentilles de skraft.

## Prérequis

- Un dépôt configuré, Git, et un terminal à la racine de la copie de travail ; `skraft` est la commande que [`npm i -g @skraft/cli`](./install-on-a-host.mdx#skraft-command) met en place ; la ligne longue `node "<dossier du plugin>/engine/drivers/cli/skraft.mjs"` marche sans elle.
- Le prompt de la lentille, écrit comme un agent de votre dépôt nommé `<nom>-lens`.

## 1. Écrire l'agent de la lentille

Une lentille `threat-model` est lancée comme l'agent `threat-model-lens`. Créez son fichier pour
chaque hôte que l'équipe utilise :

| Hôte | Fichier |
|---|---|
| Claude Code | `.claude/agents/threat-model-lens.md` |
| Copilot CLI, VS Code | `.github/agents/threat-model-lens.agent.md` (ou `.md`) |

La lentille rend sa réponse dans le format que lit le moteur :
[Réponse d'une lentille](../reference/gates.md#lens-answer).

## 2. Copier le workflow de la revue visée

| Revue | Commande | Fichier copié |
|---|---|---|
| DESIGN, DISTILL ou mutation | `skraft workflow eject` | `.skraft/pipeline.skraft.dot` |
| DELIVER (et `skraft review --pr`) | `skraft workflow eject review` | `.skraft/review.skraft.dot` |

```text
.skraft/review.skraft.dot holds the skraft 2.0.0-alpha.19 review; every call to review runs it
```

Dès qu'un fichier est copié, chaque run de la copie de travail le suit.

## 3. Ajouter le nœud lentille et ses deux arêtes

Une lentille est un nœud `shape=note` entre le fan-out de la revue et son réfuteur (`shape=octagon`), qui mène au fan-in.

**Revue de conception**, dans `.skraft/pipeline.skraft.dot` :

```text
design_review_threat_model [shape=note, lens="threat-model"]
design_review_lenses -> design_review_threat_model -> design_review_refuter
```

**Revue DELIVER**, dans `.skraft/review.skraft.dot`, entre `lenses` et `refuter` :

```text
threat_model [shape=note, lens="threat-model"]
lenses -> threat_model -> refuter
```

Options du nœud :

- `model="<famille>"` choisit la famille de modèle de la lentille (une règle `assign.agents`
  l'emporte, voir [Choisir les modèles des agents](./choose-models.md)) ;
- `when="mock"` ou `when="contract"` ne la lance que si les changements touchent des mocks ou
  des contrats ([lentilles conditionnelles](../reference/workflow-dot.mdx#conditional-lenses)).

## 4. Vérifier le workflow

```console
$ skraft workflow check
$ skraft workflow diff
```

Résultat attendu :

```text
.skraft/pipeline.skraft.dot is valid: phases RESEARCH, DESIGN, DISTILL, DELIVER, PUBLISH
+ node design_review_threat_model (lens threat-model)
.skraft/pipeline.skraft.dot: 1 changes from the skraft 2.0.0-alpha.19 workflow
```

Commitez `.skraft/` et le fichier de l'agent : la lentille tourne à la prochaine revue, avec les
autres.

## Dépannage

| Message | Action |
|---|---|
| `node deliver_review: lens threat-model (agent threat-model-lens) not found in the plugin, .claude/agents/ or .github/agents/` | Créer le fichier de l'agent sous le nom `<nom>-lens`. |
| `mandatory node test_integrity (…) is missing; this node is mandatory and cannot be removed` | Remettre le nœud : les fan-in, `deliver_review` et les lentilles `test-integrity` et `architecture-boundaries` sont obligatoires ([nœuds obligatoires](../reference/workflow-dot.mdx#mandatory-nodes)). |
| `.skraft/pipeline.skraft.dot already exists; edit it, or remove it` | Modifier la copie existante. |
| Un nœud `lenses="a,b,c"` refusé | Workflow copié avant la forme actuelle : remplacer le nœud par les nœuds et arêtes que le message écrit. |
| La lentille ne tourne pas | Vérifier qu'aucun `when` ne l'écarte, et que le run suit bien `.skraft/` (`skraft workflow check` nomme le fichier). |

## Étapes suivantes <!-- #next-steps -->

- [Revue : fan-out, nœuds lentille, réfuteur, fan-in](../reference/workflow-dot.mdx#reviews)
  et [nœud d'appel](../reference/workflow-dot.mdx#call-node).
- [Gates](../reference/gates.md#review-run) — réponse d'une lentille,
  réfutation, verdict.
- [Adapter skraft : ce que coûte chaque réglage](../explanation/customisation-trade-offs.md)
