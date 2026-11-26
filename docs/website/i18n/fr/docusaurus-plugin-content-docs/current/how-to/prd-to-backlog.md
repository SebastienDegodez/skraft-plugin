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
- Le PRD dans le dépôt, tel que l'outil qui l'a écrit l'a laissé (skraft, `prd-builder` de HVE,
  BMad ou à la main) : skraft le lit et ne le réécrit jamais.
- Aucun `skraft-config.json` : `skraft-backlog` n'en lit aucune clé, donc il tourne dans un dépôt que `/skraft-init` n'a jamais touché. Le refus `skraft is not initialised` n'appartient qu'au pipeline d'ingénierie.

## 1. Vérifier le PRD

```markdown
### EP-001 : Commande en ligne

* `FR-001` : Le client choisit une boisson et sa taille.
* `FR-002` : Le client paie sa commande par carte.
```

Une exigence est définie là où son id ouvre un titre, une puce, une ligne, un passage en gras ou
la première cellule d'une ligne de tableau : `` * `FR-001` : … ``, `FR-001: …`,
`**FR-1 Titre.** …`, `| FR-001 | … |`. Un id qui n'apparaît que dans une liste ou une matrice de
traçabilité est une référence. En plus de `FR`, `US` compte comme exigence, et le frontmatter
d'un PRD HVE (`requirement_id_prefixes`) ajoute ses propres préfixes.

Les epics viennent du PRD quand il en propose : titres `### EP-001 : …`, features `FEAT-###`, ou
titres sous une section de features. Quand il n'en propose aucune, le cadrage explique la
découpe au product owner : une epic par capacité livrée et déployée ensemble (un bounded context
n'est une epic que s'il se déploie seul). Une exigence `FR` appartient à l'epic sous laquelle
elle est écrite. Un PRD encore en brouillon, ou qui cite une exigence sans jamais la définir,
devient une question de cadrage : le PRD n'est jamais modifié. Un PRD sans aucune exigence est
refusé.

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
| `format` | `hve` : lire les familles d'exigences que déclare un PRD HVE ; par défaut : détecté |
| `corrections` | `true` : appliquer les corrections acceptées dans le canvas (étape 5) |

Toute autre clé est refusée (`invalid-args`) et rien ne démarre. Les fichiers de travail sont
sous `.copilot-tracking/skraft-plans/<slug>/backlog/`.

## 3. Répondre au cadrage, puis approuver la carte

Le run s'arrête trois fois avant d'écrire les stories. Après chaque réponse, reprenez le workflow
en pause depuis `/workflows`.

1. **Cadrage** (`framing-answered`) : les questions sont dans `framing.json` (découpage des
   canaux, milestones, epics trop denses, questions du découpeur). Répondez dans le canvas
   *skraft backlog* (demandez à Copilot *« open the skraft backlog canvas »*), ou écrivez la
   réponse dans `framing.json`, sous `answers`, par identifiant de question :

   ```json
   "answers": { "milestones": { "text": "M1 : commande au comptoir, M2 : paiement" } }
   ```

   Une question sans réponse prend l'option recommandée.
2. **Epics** (`story-map-approved`) : relisez `story-map.md`. Le découpeur n'a découpé le PRD
   qu'en epics, avec ce que chacune couvre et les milestones ; pas encore de story. Pour changer
   la découpe, modifiez `story-map.json` : la reprise le revérifie tel qu'il est. Ses tableaux : [story-map.md](../reference/backlog-canvas.md#story-map).
   Un plan que le planner HVE a laissé pour le PRD donne les epics dont le découpeur part ;
   chacune qu'il ne suit pas a une ligne dans **Decisions**.
3. **Stories** (`stories-approved`) : chaque epic du run (`epics`, par défaut toutes) est
   découpée en stories par un agent neuf, une epic après l'autre. Relisez `story-map.md`,
   modifiez `story-map.json` si besoin, reprenez.

## 4. Laisser écrire et relire les stories

Un `story-writer` par story, puis les quatre lentilles de planification, epic par epic. Suivez
l'avancement dans le canvas, onglet **Suivi** (**Progress** pour un PRD en anglais : le canvas
suit la langue du PRD) : chaque story y est approuvée, refusée, ou retenue parce qu'elle attend
une story refusée. L'onglet **Revue** dit pourquoi une story ne passe pas et comment la
corriger. Chaque compteur, statut et onglet : [Canvas du backlog](../reference/backlog-canvas.md#progress-tab).

![Canvas skraft backlog, onglet Suivi, pendant ELABORATE : « 8 agents au travail », un story-writer par story avec sa tentative et depuis quand il tourne, puis 3 épics, 16 stories, 9/16 fiches écrites, aucune refusée pour l'instant](/img/screenshots/fr/backlog-canvas-elaborate.png)

*Figure 1 — ELABORATE sur l'extrait d'un vrai PRD rédigé en français ([dépôt de démonstration](https://github.com/SebastienDegodez/skraft-demo-event-storming)) : huit agents `story-writer` au travail.*

**Pour le product owner : une epic à la fois, dans une session neuve.** Sur un gros PRD,
approuvez les epics une fois, puis découpez et élaborez une epic par run, chaque run dans une
nouvelle session Copilot pour que son contexte reparte propre : `epics: ["EP-001"]`, puis
`["EP-002"]`… La carte reste la référence : chaque run reprend `story-map.json` et `framing.json`
tels qu'ils sont (reprenez la pause des epics sans rien changer), et crée dès que son epic est
prête. Une story publiée par une session précédente compte comme prête : une story qui l'attend
n'est pas retenue.

Redécoupez régulièrement, quand le PRD ou ce que l'équipe a appris change la découpe : supprimez
`story-map.json` (et `framing.json` pour reposer les questions de cadrage), puis relancez dans une
nouvelle session. Les issues déjà créées ne sont jamais modifiées ni fermées, et une story que la
nouvelle carte renomme est créée à nouveau : ne redécoupez que les epics pas encore publiées.

## 5. Corriger une story retenue (si besoin)

Dans le canvas, acceptez une des corrections proposées pour la story (découper, déclarer une
dépendance, préciser un critère…) ou répondez à ses questions ouvertes, puis relancez :

```text
Run the skraft-prd-backlog workflow with prd docs/prds/commande-en-ligne.md and corrections true
```

![Canvas skraft backlog, onglet Revue : la story EP-001-S05 « Attribuer un rôle applicatif » retenue, les trois raisons de sa revue, un bouton « Répondre 2 » pour ses questions ouvertes, puis les lettres INVEST, chacune avec la valeur trouvée ; à gauche les stories d'EP-001, deux prêtes et trois retenues](/img/screenshots/fr/backlog-canvas-handoff-review.png)

*Figure 2 — Une story retenue du même run : la revue dit pourquoi, et ses deux questions ouvertes
attendent une réponse.*

Seules les stories touchées sont réécrites et relues. Sans correction acceptée ni réponse en
attente, le run est refusé et rien ne change.

## 6. Valider le handoff et publier

Quand le run s'arrête sur la passation, le canvas résume le backlog :

![Canvas skraft backlog, onglet Suivi, à la passation : 3 épics, 16 stories, 16/16 fiches écrites, 0 refusée, 4 retenues, 12 prêtes, 0/12 relue, 0 publiée, puis l'épic EP-001 rejetée à la tentative 3 et ses stories, prêtes ou retenues ; en bas les boutons « Aperçu à blanc » et « Créer les issues » vers SebastienDegodez/skraft-demo-event-storming](/img/screenshots/fr/backlog-canvas-handoff-progress.png)

*Figure 3 — La passation du run de démonstration : 12 stories prêtes à créer, 4 retenues.*

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
| `args.prd: the PRD defines no functional requirement — …` | Vérifier que chaque id d'exigence ouvre sa ligne, sa puce, son titre, son passage en gras ou sa ligne de tableau ; pour un PRD HVE à préfixes propres, passer `format: hve`. Le PRD lui-même n'est jamais réécrit. |
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
