# Architecture du dépôt `skraft-plugin` (V2)

Ce document s'adresse à qui contribue au dépôt : où vit chaque morceau, qui a le droit
d'importer quoi, et comment un run avance. Les règles opposables sont dans
[`AGENTS.md`](../AGENTS.md) ; les décisions dans [ADR-001](adr/adr-001-host-neutral-engine-with-drivers.md)
(moteur, pilotes, zéro hook) et [ADR-002](adr/adr-002-copilot-host-driver-contract.md) (contrat du
pilote Copilot) ; le plan dans [`v2/prd.md`](v2/prd.md).

> **Conventions** : [`conventions.md`](./conventions.md). La documentation utilisateur vit sur
> le [site](site/) (FR et EN).

---

## 1. Structure du dépôt

```text
plugins/
  skraft-framework/                   plugin central, identité d'installation « skraft »
    plugin.json                       schéma Agent Plugins v1, sans liste agents racine
    .claude-plugin/plugin.json        enregistrement explicite des 19 agents pour Claude Code
    hooks/hooks.json                  { "modules": ["./skraft-mod.tsx"] }, aucun hook de commande
    hooks/skraft-mod.tsx              module du mod Claude Code : câblage de `$`, une ligne par appel
    com.github.copilot/agents/        19 descripteurs `.agent.md`
    com.github.copilot/extensions/skraft-pipeline/   extension Copilot : workflow `skraft-pipeline`, outil `skraft_decide`
    com.anthropic.claude-code/agents/ 19 descripteurs Claude Code `.md`
    engine/                           le moteur (§2)
    workflows/                        pipeline.skraft.dot, review.skraft.dot (§4)
    schemas/                          schémas de skraft-config.json et skraft-config.local.json
    skills/                           skills autonomes, scripts compris
    assets/templates/                 gabarits depuis lesquels le moteur pré-crée les sorties
  skraft-backlog/                     plugin backlog ; aucun code partagé avec le central
  skraft-brownfield/                  plugin brownfield, installé à côté du central (§9)

tests/
  skraft-framework/unit/<feature>/         tests d'acceptation des cas d'usage, doubles InMemory
  skraft-framework/integration/<feature>/  infrastructure réelle, CLI, pilotes sur hôte simulé, règles d'architecture
  skill-scripts/  tooling/  regression/  site/  skills/<skill>/eval.yaml  agents/<suite>/eval.yaml

eng/
  regression/    compare un run v1 (worktree sur `main`) et un run V2 sur les mêmes fixtures
  host-probe/    sonde de l'hôte Copilot, sans appel de modèle
  …              catalogue, exécuteurs Vally, tableau de bord
scripts/         synchronisation des agents et des skills, politique de modèles, CI locale
```

## 2. Le moteur : quatre couches

`plugins/skraft-framework/engine/` est en JavaScript + JSDoc (`checkJs`) ; seul le module du mod
est en TypeScript.

| Couche | Contenu | Peut importer |
|---|---|---|
| `domain/` | politiques pures : analyseur DOT, état dérivé du journal, verdict de revue, barre de mutation, attribution des modèles, rendu des rapports | `domain/` |
| `application/` | cas d'usage et contrats de leurs dépendances (`application/ports/`) | `domain/`, `application/` |
| `infrastructure/` | fichiers, git, processus, clés du journal, `gh`, réglages de l'hôte | `domain/`, `infrastructure/`, contrats de `application/ports/` ; jamais un pilote ni un cas d'usage |
| `drivers/` | un dossier par hôte : compose les cas d'usage avec l'infrastructure | tout sauf un autre pilote |

`domain/` et `application/` n'utilisent ni module `node:`, ni `process`, ni `child_process`, ni
`$` : c'est ce qui permet au module du mod (sans Node ni `import()`) et à l'extension Copilot
(Node) de charger le même code. Une règle d'architecture le vérifie en intégration.

Les features de `application/` : `pipeline` (Init, RunPipeline, Observe), `decisions`
(Decide), `config` (ConfigureComponents), `diagnostics` (Doctor), `gates` (RunGate),
`workflow` (WorkflowCommands), `review`, `journal` (AdoptJournal), `publish` (Publish).
Un point d'entrée porte le suffixe `-usecase.mjs` ; un helper reste dans sa feature, ou dans
`shared/` quand plusieurs features s'en servent.

## 3. Les pilotes

Un pilote exécute ce que le moteur demande ; il ne décide ni de l'ordre, ni du verdict, ni de
l'avancement. Il est le seul à lancer des agents (**profondeur 1**) : aucun agent n'en lance un
autre, lentilles et réfutateur compris. Seule exception, hors du central : `brownfield-refactorer`,
pris comme agent principal d'une session, lance `refactoring-worker`.

| Pilote | Hôte | Lance les agents | Pose les questions | Montre le run |
|---|---|---|---|---|
| `drivers/claude-mod/` | Claude Code | `$.agent.spawn`, lot en parallèle | `$.ui.ask`, boutons du panneau | panneau Skraft, `/skraft` |
| `drivers/copilot-workflow/` | Copilot CLI | `ctx.agent`, borné par `maxConcurrentSubagents` | `ctx.pause`, réponse confirmée par `session.ui.confirm` (outil `skraft_decide` ou boutons du canvas) | canvas `skraft-pipeline`, journal `/workflows` |
| `drivers/copilot-sdk/` | VS Code, SDK Copilot présent | lance le CLI Copilot sans interface et y suit le workflow `skraft-pipeline` | dans le terminal | terminal |
| `drivers/cli/` | VS Code sans SDK, et tout terminal | `skraft next` écrit les briefs, l'agent orchestrateur lance les sous-agents, `skraft record` reprend ; lentilles en séquence | `skraft decide` | `skraft status`, `WORKFLOW.md` |

`skraft doctor` dit lequel des deux pilotes VS Code tournera et pourquoi. L'agent
`skraft-orchestrator` n'est qu'un lanceur : il appelle l'outil du mod, le workflow Copilot, ou
conduit la boucle `next` / `record`. Sous Claude Code, il n'a pour seul outil que
`mcp__skraft__run_pipeline`, aucun outil d'édition ; sous VS Code, il n'écrit que les fichiers
de réponse que la boucle liste.

Le CLI (`drivers/cli/skraft.mjs`) appelle les cas d'usage qui ne lancent pas d'agent : `init`,
`status`, `report`, `decide`, `gate`, `doctor`, `workflow eject|check|diff`, `journal adopt`,
`publish`. La référence complète est sur le site, `reference/cli.md`.

## 4. Le workflow : un graphe DOT

Le pipeline n'est pas codé en dur : `workflows/pipeline.skraft.dot` est chargé, validé puis
exécuté. Un analyseur DOT pur, dans `domain/workflow/`, lit le sous-ensemble utile (nœuds,
arêtes, attributs, sous-graphes, commentaires).

| Forme | Type de nœud |
|---|---|
| `Mdiamond`, `Msquare` | début, fin |
| `box` | agent (`agent=`, `outputs=`, `writes=`, `each="survivor-file"`) |
| `parallelogram` | gate de commandes (`gate=`), ou publication (`publish="pull-request"`, `publish="playwright-visuals"`) |
| `component` → `note` → `tripleoctagon` | revue : fan-out, une lentille par branche (`lens=`, `when="mock"`/`"contract"`), fan-in qui réfute et calcule le verdict |
| `hexagon` | question humaine (`question=`) |
| `house` | appel d'un autre workflow (`workflow="review"`) |

- **Garde-fous du graphe** : un seul début, au moins une fin, chaque nœud atteignable, un
  `max_visits` sur toute boucle, des agents qui existent. Un graphe fautif est refusé avec la
  raison avant tout run.
- **Nœuds `locked`** (gates de DELIVER) : une copie ne les retire qu'avec `unlock="<raison>"`,
  journalisé et repris dans la pull request.
- **Nœuds `mandatory`** (revues, lentilles test-integrity et architecture-boundaries) : rien ne
  permet de les retirer, de les contourner ou de les affaiblir ; c'est le graphe du plugin qui
  fait foi, pas l'attribut de la copie.
- **Nœud d'appel** : `deliver_review` appelle `review.skraft.dot`. Le workflow appelé déclare ses
  entrées (`input_base="required"`…), l'appel les lie par nom à ce que le run détient (`base`,
  `head`, `story`, `documents`, `components`) ou par `with_<nom>=`. Un workflow appelé n'en
  appelle aucun autre et ne lit pas le journal du run.
- **Copie du dépôt** : `skraft workflow eject` copie le pipeline dans `.skraft/pipeline.skraft.dot`,
  `skraft workflow eject review` la revue dans `.skraft/review.skraft.dot` ; le moteur lit la copie
  quand elle existe. `skraft workflow check` valide, `skraft workflow diff` compare au graphe du
  plugin sans rien écraser.

Les contrôles du moteur (journal, périmètre d'écriture, sorties attendues) ne sont pas des
nœuds : aucune copie ne les retire.

## 5. État : journal, pipeline actif, bail

Tout vit dans `.copilot-tracking/skraft-plans/` de la copie de travail qui lance le run.

- **`<slug>/events.jsonl`** : un événement par fait. Chaque ligne porte le hachage de la
  précédente et se termine par `"sig"`, un HMAC de la ligne sous la clé du run ; la première
  ligne nomme cette clé (`keyId`). Les clés vivent dans `~/.skraft/journal-keys/<id>.key`. L'état
  est recalculé à la lecture ; une chaîne cassée ou une signature fausse arrête le run
  (`journal-tampered`). Un journal que cette machine ne peut pas vérifier (clé absente) rend
  `journal-unverifiable` ; `skraft journal adopt`, tapé par la personne et confirmé au terminal,
  écrit une ligne `journal.adopted` et signe la suite sous une nouvelle clé de la machine, les
  lignes antérieures restant telles quelles.
- **`.active-slug`** : le pipeline actif de la copie de travail ; obligatoire, jamais deviné. Un
  worktree a son propre `.copilot-tracking/`, donc son propre pipeline.
- **`<slug>/.lock`** : le bail de la session qui pilote le run (`<owner> <since> <renewed> [<ttl>]`),
  renouvelé toutes les 30 s, périmé après 2 min sans renouvellement. Une deuxième session est
  refusée (`pipeline-locked`) tant que la première renouvelle ; une session qui a perdu son bail
  s'arrête (`lock-lost`). Quand la boucle `next` / `record` confie des agents, le bail reste
  laissé le temps de leur travail, borné, et `record` le reprend.

## 6. Configuration

`skraft-config.json`, à la racine du dépôt, liste des **composants** : `name`, `root`, `stack`,
`paths` (`src`, `tests`), `commands` (`build`, `format`, `lint`, `test`, `architecture`,
`coverage`, `mutation`, `e2e`), `baseBranch`, `mocking`, `contractTesting`. Un composant peut être
un autre dépôt. `skraft init` les détecte, `skraft doctor` vérifie chaque commande. Une commande
écrite par le développeur l'emporte toujours ; les seuils de qualité ne sont pas configurables.

La configuration se fusionne en quatre couches (JSON Merge Patch) : défauts du plugin,
`~/.skraft/config.json`, `skraft-config.json`, `skraft-config.local.json` non commité.

**Modèles.** Un agent tourne sur une **famille** : un palier (`economy` < `standard` <
`frontier` < `premium`), un rôle au palier intégré (`reviewer`, `researcher`, `implementer`,
`planner`) ou une famille libre qui déclare son `tier`. `assign` choisit la famille de chaque
agent (par agent, puis `model=` / `refuter=` d'un workflow éjecté, puis par type, puis par
défaut) ; `models` donne, par hôte (`claude-code`, `copilot`), un modèle ou une liste et un effort.
Les défauts du plugin ne contiennent que des alias Claude Code ; aucun nom de modèle n'est écrit
dans le code. Le moteur journalise l'attribution résolue, le pilote passe modèle et effort au
lancement quand l'hôte les accepte.

## 7. Contrôles d'une étape et gates

Après chaque étape d'agent, le moteur vérifie :

- **sorties attendues** : pré-créées depuis leur gabarit, chemins absolus dans le brief ; une
  sortie manquante ou un résultat invalide est redemandé avec la raison, au plus trois
  tentatives, et deux échecs identiques arrêtent le run (disjoncteur) ;
- **périmètre d'écriture** : le diff git de l'étape comparé à ce que l'agent peut écrire (son
  rôle, `writes=` du nœud, chemins `src`/`tests` des composants en DELIVER) ;
- **commits** : convention de message ; en DELIVER, chaque commit rouge est rejoué pour
  confirmer que ses tests échouent, un vert sans rouge avant lui est refusé (`tdd.replay` :
  `all` ou `last-red`) ;
- **ADR** : cycle de vie et ratification par une décision humaine.

Les **gates** lancent les commandes des composants touchés, depuis leur racine, dans l'ordre
build, format, lint, test, architecture, coverage, mutation ; le moteur écrit les preuves sous
`<slug>/gates/`. Un échec est classé `environment` (commande introuvable, Docker absent pour
Microcks) ou `deterministic`. La **mutation** se juge par périmètre : 100 % pour le cœur (un
dossier dont le nom finit par `domain` ou `application`), 80 % pour la frontière (le reste) ;
`kill_mutants` lance le software-engineer une fois par fichier de survivants, sous la lentille
test-integrity.

## 8. Revue

Une revue est un fan-out vers des nœuds de lentille, puis un fan-in. Le moteur lance les
lentilles par le pilote (en parallèle quand l'hôte le permet), chacune avec ses seules
entrées ; il fait vérifier chaque finding `blocker`, `high` et `medium` par `finding-refuter`
(`confirmed`, `refuted`, `unverifiable`), puis calcule le verdict (`APPROVED`, `NEEDS_REWORK`,
`BLOCKED`) et l'écrit dans `reviews/<node>-<visit>/verdict.yaml`. La **re-revue est
incrémentale** : une lentille dont l'empreinte d'entrées n'a pas changé est reprise du passage
précédent (`reused`). Le réfutateur tourne un palier au-dessus des lentilles qu'il vérifie, jamais
au-delà de `frontier`.

## 9. Fin de run, vues et rapports

- **Pull request** : `pr_writer` (agent `pr-writer`) écrit la prose, le nœud `publish` pousse la
  branche et ouvre une pull request en brouillon, ou la met à jour. Consentement demandé une fois
  par dépôt (`publish-consent`, rangé dans `publish.pullRequest`) ; sans consentement, remote ou
  `gh`, la description reste dans `pull-request.md` et `skraft publish` la publie plus tard.
- **Captures** : le nœud `visuals` lance la commande `e2e` des composants front, commite les
  captures du manifeste `playwright-evidence`, après le consentement `reporting-consent`.
- **Issue** : avec le consentement `publish.pullRequest`, un run lancé depuis une issue y tient
  un commentaire de progression, réécrit à chaque transition ; sans lui, chaque transition est
  journalisée non publiée, et le run continue.
- **Observe** calcule depuis le journal la vue que lisent `skraft status`, le panneau Claude
  Code et, quand l'hôte affiche les canvas (affichage dans l'app Copilot et le terminal du CLI
  pas encore mesuré), le canvas Copilot `skraft-pipeline` (graphe du workflow, verdicts, gates, coût,
  question en attente avec ses boutons de réponse ; le canvas ne montre pas de coût, Copilot
  comptant en crédits). Sous Copilot, le journal `/workflows` montre aussi les phases et les
  messages du run.
  Après chaque étape, le moteur réécrit `WORKFLOW.md`, `run-report.md` (temps, coût, relances
  par étape) et `qa-report.md` (plan de test, gates, mutation, commits rouges, verdicts) pour
  l'équipe de qualification.

## 10. Agents et skills

Deux arbres d'agents éditables, `com.github.copilot/agents/` et
`com.anthropic.claude-code/agents/`, synchronisés par `npm run plugin:sync` (corps et
description ; en-têtes propres à chaque client préservés) ; tout agent est enregistré dans
`.claude-plugin/plugin.json`. Le central compte 19 agents : l'orchestrateur, les quatre
spécialistes, `pr-writer`, `finding-refuter` et douze lentilles. Une skill embarque chaque script
qu'elle lance ; les copies déclarées sont tenues par `npm run skills:sync`. Chaque changement
d'agent ou de skill se juge avec Vally ([`skill-evaluation.md`](./skill-evaluation.md)).

`skraft-brownfield` est un plugin autonome : `brownfield-analyst`, `brownfield-harness-builder`,
`brownfield-refactorer`, `refactoring-worker`, et les skills `characterize-brownfield`,
`characterize-with-contracts`, `mikado-method`, `strangler-fig-method`. Il réutilise des skills du
central par leur nom et les commandes de `skraft-config.json`, jamais par chemin.

## 11. Tester le moteur

Le moteur s'applique à lui-même ce que skraft impose aux projets ; le détail est dans
[`AGENTS.md`](../AGENTS.md) (TDD outside-in depuis le cas d'usage, mutation Stryker, limites
ESLint, régression v1/V2). L'essentiel :

- `tests/skraft-framework/unit/<feature>/` entre par un cas d'usage, avec des doubles InMemory
  écrits à la main ; le LLM n'est jamais appelé, les réponses d'agents sont des fichiers écrits
  par le test ;
- `tests/skraft-framework/integration/<feature>/` utilise la vraie infrastructure (dossiers temporaires, git, processus), le CLI de bout en
  bout et les pilotes sur hôte simulé, sous Windows, macOS et Linux ;
- `eng/host-probe/` mesure ce que le pilote Copilot suppose de l'hôte
  ([`v2/host-verification.md`](v2/host-verification.md)).

## 12. Revue d'une pull request et migration v1

- **`skraft review --pr <numéro>`** (cas d'usage `ReviewPullRequest`, `application/review/`) fait
  tourner `review.skraft.dot` sur une pull request seule, sans run : workflow, configuration et
  règles du projet lus au commit de base, jamais à la tête ; état dans
  `.copilot-tracking/skraft-reviews/pr-<numéro>/`, avec son propre journal signé et son propre
  bail ; `--publish` garde le verdict dans un seul commentaire, après consentement. Sous
  Copilot, le workflow `skraft-review`.
- **`skraft migrate`** (cas d'usage `Migrate`, `application/migration/`) réécrit un
  `skraft-config.json` v1 au format à composants et donne à chaque run v1 en cours un journal
  signé marqué `migratedFrom: "v1"`, ses phases terminées closes ; `state.json` n'est jamais
  touché, la commande est idempotente.

Reste à venir pour la 2.0.0 : la comparaison finale v1/V2 sur toutes les fixtures, et la
vérification à la main du canvas Copilot dans l'app (`docs/v2/host-verification.md`).
