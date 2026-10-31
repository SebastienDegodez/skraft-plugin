---
title: "Transformer un PRD en backlog GitHub"
description: "Lancer skraft-prd-backlog sur un PRD approuvé, répondre au cadrage, approuver la carte, valider le handoff, publier sur GitHub sans doublon."
persona: tech-lead
---

# Transformer un PRD en backlog GitHub

Passez d'un PRD approuvé à des epics et des stories prêtes sur GitHub, avec leurs dépendances et
leurs milestones.

## Prérequis

- Copilot CLI avec le plugin `skraft-backlog` installé
  ([Installer skraft sur un hôte](./install-on-a-host.mdx)). Le
  workflow `skraft-prd-backlog` est un workflow dynamique de Copilot CLI.
- `gh` connecté (`gh auth status`) avec le droit de créer des issues, labels et milestones sur le
  dépôt cible.
- Le PRD dans le dépôt, écrit sur le gabarit canonique : chaque exigence en puce
  `` * `FR-001` : <énoncé> `` (de même `NFR-`, `AC-`, `CON-`, `GOAL-`), chaque epic en titre
  `### EP-001 : <titre>`.

## 1. Vérifier le PRD

```markdown
### EP-001 : Commande en ligne

* `FR-001` : Le client choisit une boisson et sa taille.
* `FR-002` : Le client paie sa commande par carte.
```

Une exigence `FR` appartient à l'epic du titre placé au-dessus d'elle. Un PRD sans aucune
exigence `FR-###` est refusé.

## 2. Lancer le workflow

Demandez à Copilot CLI, avec le chemin du PRD :

```text
Run the skraft-prd-backlog workflow with prd docs/prds/commande-en-ligne.md
```

| Argument | Effet |
|---|---|
| `prd` (obligatoire) | chemin du PRD |
| `slug` | nom kebab-case du backlog ; défaut : le nom du fichier PRD |
| `repo` | `owner/repo` où publier ; défaut : le dépôt du dossier de travail |
| `epics` | n'élaborer que ces epics, par exemple `["EP-001"]` |
| `approve` | `true` : ni questions du découpeur au cadrage, ni pause sur la carte des stories |
| `dryRun` | `true` : simuler la publication |
| `frame` | `false` : découper sans questions de cadrage |
| `corrections` | `true` : appliquer les corrections acceptées dans le canvas (étape 5) |

Toute autre clé est refusée (`invalid-args`) et rien ne démarre. Les fichiers de travail sont
sous `.copilot-tracking/skraft-plans/<slug>/backlog/`.

## 3. Répondre au cadrage, puis approuver la carte

Le run s'arrête deux fois avant d'écrire les stories. Après chaque réponse, reprenez le workflow
en pause depuis `/workflows`.

1. **Cadrage** (`framing-answered`) : les questions sont dans `framing.json` (découpage des
   canaux, milestones, epics trop denses, questions du découpeur). Répondez dans le canvas
   *skraft backlog* (demandez à Copilot *« open the skraft backlog canvas »*), ou écrivez la
   réponse dans `framing.json`, sous `answers`, par identifiant de question :

   ```json
   "answers": { "milestones": { "text": "M1 : commande au comptoir, M2 : paiement" } }
   ```

   Une question sans réponse prend l'option recommandée.
2. **Carte des stories** (`story-map-approved`) : relisez `story-map.md`. Pour changer le
   découpage, modifiez `story-map.json` : la reprise le revérifie tel qu'il est.

## 4. Laisser écrire et relire les stories

Un `story-writer` par story, puis les quatre lentilles de planification, epic par epic. Suivez
l'avancement dans le canvas, onglet **Suivi** (**Progress** pour un PRD en anglais : le canvas
suit la langue du PRD) : chaque story y est approuvée, refusée, ou retenue parce qu'elle attend
une story refusée. L'onglet **Revue** dit pourquoi une story ne passe pas et comment la
corriger.

## 5. Corriger une story retenue (si besoin)

Dans le canvas, acceptez une des corrections proposées pour la story (découper, déclarer une
dépendance, préciser un critère…) ou répondez à ses questions ouvertes, puis relancez :

```text
Run the skraft-prd-backlog workflow with prd docs/prds/commande-en-ligne.md and corrections true
```

Seules les stories touchées sont réécrites et relues. Sans correction acceptée ni réponse en
attente, le run est refusé et rien ne change.

## 6. Valider le handoff et publier

Le run s'arrête sur `.copilot-tracking/github-issues/prds/<slug>/handoff.md` (`handoff-reviewed`).
Relisez les opérations prévues, puis cochez la case :

```markdown
> - [x] Reviewed and validated by a qualified human reviewer
```

Reprenez le workflow. Pour voir d'abord ce qui serait créé, lancez-le avec `dryRun true` : il
écrit `handoff-dryrun.md` à côté. Résultat attendu dans le journal du workflow :

```text
<owner/repo>: 14 created, 0 failed, 0 skipped
```

Chaque issue porte un marqueur caché : relancer le workflow ne crée rien deux fois. Le canvas
permet aussi de marquer chaque story relue et de créer un epic dès qu'il est prêt (**Marquer
relue**, **Aperçu à blanc**, **Créer les issues**) ; ces actions sont réservées à la personne,
jamais à l'agent.

## Dépannage

| Message | Action |
|---|---|
| `args.prd: the PRD defines no FR-### requirement` | Écrire les exigences en puces `` * `FR-001` : … ``. |
| `agents not registered in this session: …` | Redémarrer la session Copilot, ou réinstaller `skraft-backlog`, puis relancer. |
| `SLICE: N problem(s) left after 3 attempts` | Lire les problèmes listés, corriger `story-map.json` à la main, relancer. |
| `args.epics: an epic it names is not in the story map` | Reprendre les identifiants `EP-…` de `story-map.json`. |
| `check the Human Review box of …/handoff.md, then resume the run` | Cocher la case de l'étape 6, reprendre. |
| `destination binding: <repo> answers as <autre>` | Passer le nom exact du dépôt dans `repo` (un dépôt renommé ou transféré répond sous son nouveau nom). |
| Statut `blocked` en PUBLISH, avec `failed` ou `skipped` | Reprendre : la publication reprend sans recréer ce qui existe ; le détail est dans `handoff-logs.md`. |

## Étapes suivantes <!-- #next-steps -->

- [Raffiner une issue du backlog](./refine-backlog.md)
- [Le backlog : de l'idée à la story prête](../explanation/backlog.md) —
  pourquoi deux arrêts humains et des lentilles de planification.
- [Gates : DISCUSS](../reference/gates.md#discuss) — critères des lentilles
  de planification.
