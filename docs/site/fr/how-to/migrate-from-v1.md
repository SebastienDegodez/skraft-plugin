---
layout: doc
lang: fr
title: "Migrer une copie de travail de la v1"
description: "Convertir avec skraft migrate un skraft-config.json v1 et les runs v1 encore en cours en configuration à composants et en journaux signés, vérifier à blanc, reprendre un run migré, et lever les refus."
persona: software-engineer
---

# Migrer une copie de travail de la v1

**But** : reprendre en V2 un dépôt laissé par skraft v1, sans perdre les runs en cours.

## Prérequis

- Le plugin `skraft` en version 2 installé
  ([Installer skraft sur un hôte]({{ "/fr/how-to/install-on-a-host" | relative_url }})) ; `skraft` est la commande que [`skraft install`]({{ "/fr/how-to/install-on-a-host" | relative_url }}#skraft-command) met en place ; la ligne longue `node "<dossier du plugin>/engine/drivers/cli/skraft.mjs"` marche sans elle.
- Un terminal à la racine de la copie de travail, Git, Node 22 ou plus.
- Les fichiers v1 commités, pour pouvoir revenir en arrière : `skraft-config.json` est réécrit en
  place.

## 1. Voir ce que la migration écrirait

```text
skraft migrate --dry-run
```

```text
skraft-config.json: dropped trackingLayout and observability; skraft init would then list the components it finds; their bases are not shown
would write skraft-config.json:
  {
    "baseBranch": "main"
  }
would-migrate  checkout-flow: DISTILL restarts at distill, RESEARCH and DESIGN closed; 1 artefact path of the completed phases dropped (outside-run 1); resume it with skraft init checkout-flow
  would append: {"type":"run.started","slug":"checkout-flow",…,"migratedFrom":"v1"}
  would append: {"type":"phase.closed","phase":"RESEARCH"}
  would append: {"type":"phase.closed","phase":"DESIGN"}
skipped  shipped: the v1 run is DONE; nothing to migrate
skraft migrate: 1 to migrate (dry run: nothing written), 1 skipped, 0 refused
```

Rien n'est écrit. Lisez chaque ligne :

- **la configuration** : les clés v1 (`trackingLayout`, `observability`, `depthTier`,
  `depthTierRationale`) sont retirées, les clés V2 gardées, puis les composants détectés ;
- **chaque run v1 en cours** (`state.json` sans `events.jsonl`) : ses phases terminées sont
  closes, sa phase en cours repart de son premier nœud. Un chemin d'artefact hors du dossier du
  run, absolu ou illisible est écarté et compté ;
- un run que la v1 a fini (`DONE`) est sauté.

## 2. Lever ce qui est refusé

La commande sort avec 1 tant qu'un run est refusé ou qu'une clé de configuration ne correspond à
rien. Corrigez, puis relancez l'étape 1.

| Ligne | Action |
|---|---|
| `skraft-config.json: <clés> map to no key of V2; it is left as it is: move or remove them, then migrate again` | Retirer ou déplacer ces clés : V2 ne lit au premier niveau que `components`, `baseBranch`, `tdd`, `publish`, `models`, `assign` ([skraft-config.json]({{ "/fr/reference/skraft-config" | relative_url }}#top-level)). |
| `refused  <slug>: state.json holds a field the v1 state schema does not declare; nothing was migrated` | Ce `state.json` n'est pas un état v1 : le restaurer depuis Git, ou laisser ce run de côté et le redémarrer en V2. |
| `refused  <slug>: state.json names a phase the workflow skraft does not hold; nothing was migrated` | Sa phase en cours n'existe pas dans le workflow V2 : redémarrer ce run sous un nouveau slug. |
| `skipped  <slug>: already has a journal (events.jsonl); state.json is left as it is` | Rien à faire : ce run est déjà un run V2. |

## 3. Migrer

```text
skraft migrate
```

```text
skraft-config.json: dropped trackingLayout and observability; skraft-config.json: billing (javascript, .)
migrated  checkout-flow: DISTILL restarts at distill, RESEARCH and DESIGN closed; 1 artefact path of the completed phases dropped (outside-run 1); resume it with skraft init checkout-flow
skipped  shipped: the v1 run is DONE; nothing to migrate
skraft migrate: 1 migrated, 1 skipped, 0 refused
```

Chaque run migré reçoit un `events.jsonl` signé ; `state.json` n'est jamais modifié. Relancer la
commande ne change rien (`already migrated from v1`), et une migration interrompue est complétée
au lancement suivant.

## 4. Vérifier la configuration

```text
skraft doctor
```

Relisez les composants que `skraft-config.json` liste désormais et complétez leurs commandes si
besoin ([Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }})).

## 5. Reprendre un run migré

```text
skraft init checkout-flow
skraft status
```

```text
checkout-flow is the active pipeline
skraft checkout-flow: running
RESEARCH  closed
DESIGN  closed
DISTILL  pending
```

Reprenez ensuite le run depuis votre hôte, comme tout run V2
([Reprendre ou débloquer un run]({{ "/fr/how-to/resume-a-run" | relative_url }})).

## Dépannage

| Message | Action |
|---|---|
| `the environment names no home folder (HOME or USERPROFILE), where the key that signs the journal is kept; …` | Définir `HOME` (ou `USERPROFILE` sous Windows), puis relancer : la clé qui signe les journaux est rangée dans le dossier personnel. |
| `base-unresolved` | Écrire `baseBranch` dans `skraft-config.json`, puis relancer. |
| `workflow-invalid` | Le workflow éjecté sous `.skraft/` est invalide : `skraft workflow check` liste les erreurs ([Copier et adapter le workflow]({{ "/fr/how-to/eject-workflow" | relative_url }})). |
| `config-invalid` | Corriger chaque erreur listée, puis relancer. |
| la commande affiche l'aide et sort avec 2 | `migrate` ne prend que `--dry-run` et `--json`. |

## Voir aussi

- [`skraft migrate`]({{ "/fr/reference/cli" | relative_url }}) — sorties texte et JSON, codes de sortie.
- [Dossier de suivi et journal]({{ "/fr/reference/run-journal" | relative_url }}) — ce que
  remplace `state.json`.
- [Changelog : ruptures de la V2]({{ "/fr/reference/changelog" | relative_url }}#v2-breaking)
