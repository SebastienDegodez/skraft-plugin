---
title: "Choisir les modèles des agents"
description: "Choisir la famille de modèle de chaque agent, le modèle et le niveau de réflexion de chaque famille sous Claude Code et sous Copilot, pour vous seul ou pour l'équipe, et vérifier le résultat avec skraft doctor."
persona: tech-lead
---

# Choisir les modèles des agents

**But** : décider sur quel modèle, et avec quel niveau de réflexion, chaque agent de skraft
tourne, sous Claude Code et sous Copilot.

## Prérequis

- Un dépôt configuré ([Configurer les composants](./configure-components.md)).
- Un terminal à la racine de la copie de travail ; `skraft` est la commande que [`skraft install`](./install-on-a-host.mdx#skraft-command) met en place ; la ligne longue `node "<dossier du plugin>/engine/drivers/cli/skraft.mjs"` marche sans elle.

## 1. Voir ce que chaque agent reçoit aujourd'hui

```console
$ skraft doctor
```

Le doctor affiche une table par hôte :

```text
models on claude-code:
  step             agent                         type     family       tier      model   effort  source (family/model/effort)
  research         solution-researcher           phase    researcher   standard  sonnet  -       agent/tier/host
  design           solution-architect            phase    planner      frontier  opus    -       agent/tier/host
  design_review    consistency-lens              lens     reviewer     economy   haiku   -       type/tier/host
```

Sans réglage, les lentilles tournent sur `reviewer` (palier `economy`), `solution-researcher` sur
`researcher`, `solution-architect` sur `planner` (`frontier`), `pr-writer` sur `economy`, les
autres agents sur `implementer` (`standard`). Sous Claude Code, `economy`, `standard` et
`frontier` donnent `haiku`, `sonnet` et `opus` ; sous Copilot, aucun modèle : l'agent tourne sur
celui de la session.

## 2. Choisir le fichier

| Fichier | Pour qui | Commité |
|---|---|---|
| `~/.skraft/config.json` | vous, dans tous vos dépôts | non |
| `skraft-config.json` | l'équipe, dans ce dépôt | oui |
| `skraft-config.local.json` | vous, dans ce dépôt ; `skraft init` l'ajoute au `.gitignore` | non |

Chaque fichier s'applique par-dessus le précédent, dans cet ordre (JSON Merge Patch : un objet
est fusionné clé par clé, une valeur remplace, `null` retire). `~/.skraft/config.json` et
`skraft-config.local.json` suivent `schemas/skraft-config.local.schema.json` du plugin et ne
contiennent jamais `components`.

## 3. Donner un modèle et un niveau à chaque famille, par hôte

Sous `models`, une famille reçoit, pour `claude-code` et pour `copilot`, un `model` (ou une liste
essayée dans l'ordre) et un `effort` (`low`, `medium`, `high`, `xhigh`, `max`) :

```json
{
  "models": {
    "economy":  { "claude-code": { "model": "haiku",  "effort": "low" },  "copilot": { "model": "gpt-5.5", "effort": "low" } },
    "standard": { "copilot": { "model": "gpt-5.5", "effort": "high" } },
    "implementer": { "copilot": { "model": ["gpt-6.0", "gpt-5.5"] } },
    "deep-review": { "tier": "frontier", "claude-code": { "model": "opus", "effort": "max" } }
  }
}
```

Une famille est un palier (`economy` < `standard` < `frontier` < `premium`), un rôle
(`reviewer`, `researcher`, `implementer`, `planner`) ou une famille à vous qui déclare son
`tier` (`deep-review`). Ce qu'une famille ne précise pas vient de son palier, puis de l'hôte.
Un nom de famille n'est jamais un modèle versionné (`gpt-5.5` est refusé comme famille).

## 4. Affecter une famille aux agents

Sous `assign`, par agent, par type d'agent (`phase`, `lens`, `refuter`, `worker`) ou par
défaut :

```json
{
  "assign": {
    "types": { "lens": "economy" },
    "agents": {
      "software-engineer": "frontier",
      "cold-reader-lens": "deep-review",
      "architecture-boundaries-lens": { "claude-code": { "effort": "high" } },
      "fitness-lens": null
    }
  }
}
```

- une chaîne nomme la famille ; `inherit` laisse l'hôte choisir ;
- un objet ajoute un `effort` par hôte (avec `"family"` s'il change aussi la famille), jamais un
  modèle ;
- `null` retire la règle qu'un fichier précédent avait posée.

La règle par agent l'emporte sur la famille que nomme un workflow éjecté (`model=`,
`refuter=`), puis viennent la règle par type, puis `assign.default`. `finding-refuter` tourne
un palier au-dessus de la lentille la plus forte qu'il vérifie, `frontier` au plus, sauf règle
qui le nomme.

## 5. Vérifier

```console
$ skraft doctor
```

Les lignes des agents visés montrent la nouvelle famille, le modèle et le niveau, et d'où vient
chacun (`agent/family/family` : la famille vient d'une règle par agent, le modèle et le niveau de
la famille) :

```text
  deliver          software-engineer             phase    frontier     frontier  opus    -       agent/family/host
  deliver_review   cold-reader-lens              lens     deep-review  frontier  opus    max     agent/family/family
```

Le prochain run journalise ce sur quoi chaque agent a tourné. Un run repris garde ce qu'il a
journalisé, quoi que disent les fichiers depuis.

## Dépannage

| Signe | Action |
|---|---|
| `FAIL  models: assign.agents.fitnes-lens: no agent fitnes-lens in the plugin, .claude/agents/ or .github/agents/; did you mean fitness-lens?` | Corriger le nom de l'agent. |
| `WARN  models/copilot: no model on copilot for … ; these run on the session's model` | Normal sans modèle Copilot ; sinon donner un `model` à ces familles pour `copilot`. |
| `WARN  models/claude-code: CLAUDE_CODE_EFFORT_LEVEL is set …` | Retirer la variable : Claude Code l'applique à chaque agent, par-dessus le niveau choisi. |
| `WARN  models/copilot: ~/.copilot/settings.json sets subagents.agents for …` | Ces réglages Copilot sont ignorés pour les agents skraft ; les retirer ou les reporter dans `models`. |
| Sous Claude Code, le niveau ne change pas | Attendu : le mod passe le modèle mais pas le niveau ; celui du fichier d'agent s'applique. |
| Sous Copilot, le niveau ou le modèle est refusé | Copilot relance sans le niveau, puis essaie le modèle suivant de la liste, puis celui de la session. |

## Voir aussi

- [skraft-config.json](../reference/skraft-config.md#location) — les
  quatre couches et les clés `models` et `assign`.
- [Hôtes](../reference/hosts.md#capabilities) — ce que chaque hôte passe
  à l'agent : modèle, niveau, coût.
- [Économie de tokens](../explanation/token-economy.md) — pourquoi une
  famille par rôle.
