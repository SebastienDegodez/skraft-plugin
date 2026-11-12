---
title: "Phases"
description: "Chaque phase de DISCOVER à PUBLISH : qui la conduit, entrées, sorties et chemins, agents, lentilles et gates, arêtes de retour et décisions humaines."
persona: software-engineer
---

# Phases

Pour chaque phase : ce qui entre, ce qui sort et où, qui produit, qui vérifie, et ce qu'un humain décide.

Le rôle de chaque phase dans le parcours et le choix entre les parcours :
[Le pipeline SKRAFT](../explanation/pipeline/index.mdx). La syntaxe du workflow
qui les enchaîne : [Le workflow DOT](./workflow-dot.mdx). Le
détail de chaque gate citée : [Gates](./gates.md).

## Vue d'ensemble <!-- #overview -->

| Phase | Plugin | Conduite par | Agent producteur | Vérification | Décision humaine |
| --- | --- | --- | --- | --- | --- |
| DISCOVER | `skraft-backlog` | l'agent, lancé par le développeur | `backlog-discoverer` | 3 lentilles, verdict de `review-verdict.mjs` | dépôt cible, capacité |
| DISCUSS | `skraft-backlog` | l'agent, lancé par le développeur | `backlog-planner` | 4 lentilles, verdict de `review-verdict.mjs` | — |
| RESEARCH | `skraft` | le moteur | `solution-researcher` | sortie remplie, traces RESEARCH | — |
| DESIGN | `skraft` | le moteur | `solution-architect` | traces DESIGN, scan structurel, revue à 3 lentilles | `adr-ratification` |
| DISTILL | `skraft` | le moteur | `acceptance-designer` | tableau `## Scenarios`, commits rouges rejoués, revue à 4 lentilles | `scenario-review` |
| DELIVER | `skraft` | le moteur | `software-engineer` | un commit vert par scénario, rejoué ; gates, revue `review`, mutation | `mutation-plan` quand la mutation échoue |
| PUBLISH | `skraft` | le moteur | `pr-writer` | prose de la pull request | — |

DISCOVER et DISCUSS ne passent pas par le moteur : aucun journal, aucune gate de commandes.
Les phases RESEARCH à PUBLISH sont celles de `workflows/pipeline.skraft.dot` ; un workflow
éjecté peut en ajouter. À toute phase du moteur, un humain peut recevoir les questions
`environment` et `blocked` ([ci-dessous](#human-questions)).

Tous les chemins relatifs sont sous le dossier de suivi
`.copilot-tracking/skraft-plans/<slug>/` ; `{date}` est un dossier `AAAA-MM-JJ`. Un chemin qui
commence par `docs/` est dans le dépôt, hors du dossier de suivi : c'est la documentation durable
du dépôt ([Documentation durable](./run-journal.md#durable-docs)).

Le brief de chaque agent lui dit d'envoyer ce qu'affichent les commandes qu'il lance dans des
fichiers sous `logs/` et de garder ses fichiers temporaires sous `.tmp/`, sans rien écrire sous
`/tmp` ni hors de la copie de travail. Aucun de ces dossiers n'est un document d'une phase : ni
lentille ni revue ne les reçoit ([Logs](./run-journal.md#logs)).

## DISCOVER <!-- #discover -->

| | |
| --- | --- |
| Agent | `backlog-discoverer` (`user-invocable`, hors du pipeline d'ingénierie) |
| Modes | `user-assigned` (défaut, `assignee:@me is:open is:issue`), `artifact-driven` (termes tirés de `git log` des 7 derniers jours), `search-based` (labels, milestone, mots-clés) |
| Entrées | issues GitHub (outils MCP GitHub) ; contexte : milestones, `git log` |
| Sorties | `research/{date}/triage-{date}.md`, `research/{date}/sprint-proposal.md` |
| Revue | `reviews/{date}/discover-lens-<lentille>-<N>.yaml` (une réponse par lentille), `reviews/{date}/discover-review-<N>.md` |
| Effets GitHub | labels de type, priorité et effort ; `status/ready` ; jamais d'issue créée ni de corps modifié |
| Plafond | 20 issues par run |

| Lentille | Gates |
| --- | --- |
| `discovery-completeness-lens` | G1, G2 |
| `discovery-prioritization-lens` | G3, G4 |
| `discovery-duplicate-lens` | G5, G6 |

Verdict : `node <skill backlog-review-lenses>/scripts/review-verdict.mjs --phase discover …`.
`APPROVED` termine ; `NEEDS_REWORK` ou `REJECTED` relance le triage, 3 tentatives au plus,
puis les findings non résolus sont rapportés au développeur.

## DISCUSS <!-- #discuss -->

| | |
| --- | --- |
| Agent | `backlog-planner` (`user-invocable`, hors du pipeline d'ingénierie) |
| Entrées requises | `research/{date}/triage-{date}.md`, issues portant les labels de triage |
| Contexte | `research/{date}/sprint-proposal.md`, `research/{date}/triage-ingest-{date}.md` (DISCOVER sauté par un transfert amont) |
| Sorties | `plans/{date}/stories-{milestone}.md`, `plans/{date}/ac-draft-{story}.md` |
| Revue | `reviews/{date}/discuss-lens-<lentille>-<N>.yaml`, `reviews/{date}/discuss-review-<N>.md` |
| Effets GitHub | label `status/ready` (DoR passée) ou `status/needs-refinement` |
| Arrêt | entrée requise absente : blocage `missing_artefact` |

| Lentille | Gates |
| --- | --- |
| `planning-invest-lens` | G1, G2 |
| `planning-ac-quality-lens` | G3, G4 |
| `planning-coherence-lens` | G5, G6 |
| `planning-dor-lens` | G7, G8 |

Verdict : `review-verdict.mjs --phase discuss`, mêmes règles et même budget que DISCOVER.

`skraft init <slug> --from-artifacts` démarre un run du moteur en DESIGN depuis
`plans/{date}/stories-{milestone}.md` ([CLI](./cli.md)).

## RESEARCH <!-- #research -->

| Nœud | Type | Rôle |
| --- | --- | --- |
| `research` | agent `solution-researcher` | le document de recherche |

| | |
| --- | --- |
| Entrées | la story (`plans/{date}/issue-<numéro>.md` quand le run a démarré avec `--issue`) ; la documentation durable sous `docs/`, lue d'abord |
| Sortie | `research/{date}/{slug}-research.md`, pré-créé depuis `research.template.md` |
| Écriture permise | le dossier de suivi seulement |
| `docs/` couvre déjà la story | le document de recherche le dit et cite les fichiers de `docs/` avec `#file:` ; le moteur lit ces citations, donc un fichier qu'elles nomment doit exister |
| Contrôle | sortie remplie : non vide, différente du gabarit, sans `{{…}}`. Traces RESEARCH après chaque tentative : le document cite un fichier de la copie de travail sous la forme `#file:<chemin depuis la racine du dépôt>[:début[-fin]]` (une source externe par son URL). Chaque citation `#file:` — barres obliques ou inverses, un chemin nommé une seule fois quel que soit le nombre de citations — nomme un fichier lisible de la copie de travail (un chemin absolu, un chemin à segment `..` ou situé dans `.copilot-tracking/` n’est jamais lu et échoue de la même façon), et ses lignes `début` et `fin` tiennent dans la longueur de ce fichier. Un chemin écrit depuis la racine d'un composant (`#file:src/…` pour le composant `web`) échoue avec son chemin depuis la racine du dépôt (`#file:web/src/…`), chaque composant du dépôt qui le contient nommé. Un texte sans `#file:` n'est pas une citation et n'est jamais contrôlé. Les titres requis du gabarit sont présents ; les URL des sources externes utilisent HTTP(S), avec un hôte à point ou `localhost` ; exactement une approche est recommandée et au moins une est rejetée ; chaque nom de Existing tests et du Handoff apparaît dans son fichier cité (`research-records`) |
| Tentatives | 3 (défaut de `max_attempts`), moins quand deux tentatives de suite sont refusées de la même façon ; ensuite la question `blocked` sur `research` : une consigne relance le chercheur sur un nouveau passage, `STOP` termine le run avec `missing-outputs`, ou `research-records` quand le document est là et que ses citations échouent encore |

## DESIGN <!-- #design -->

| Nœud | Type | Rôle |
| --- | --- | --- |
| `design` | agent `solution-architect` | modèle d'événements, conception stratégique et tactique, ADR, matrice de cohérence |
| `design_review` | revue | lentilles `consistency`, `architecture-compliance`, `fitness` |
| `adr` | question `adr-ratification` | ratification des ADR `Proposed` |

| | |
| --- | --- |
| Entrées | la documentation durable sous `docs/`, lue d'abord ; document de recherche ; `details/{date}/structural-scan.json`, écrit par le moteur avant chaque tentative ; story |
| Sortie déclarée | `details/{date}/consistency-matrix-{slug}.md` |
| Autres sorties | dans le dossier de suivi : `details/{date}/supersession-plan-{story}.md` (quand un ADR `Accepted` est remplacé) ; dans le dépôt : `docs/architecture/context-map.md`, `docs/architecture/{bounded-context}.md` (conception tactique), `docs/domain/event-model/{bounded-context}.md`, `docs/adr/adr-{NNN}-{sujet}.md`, `docs/adr/decisions-index.md`, `docs/adr/supersessions.md` |
| Écriture permise | le dossier de suivi, `docs/adr/`, `docs/architecture/` et `docs/domain/event-model/` |
| Commits | aucun par l'architecte, qui n'a pas de shell : une fois `design` réussi, le moteur commite ce qu'il a changé dans ses chemins permis en `docs(<story>): design <story>`, terminé par `Refs: #<issue>` quand la story en a une, et le journalise en `committed` sur le `step.recorded` de l'étape |
| Documentation existante | consigne à l'agent : un fichier de `docs/` est complété, pas réécrit. Quand `docs/` couvre déjà la story, la matrice de cohérence le dit et cite les fichiers de `docs/`, et la phase passe à la suite. Contrôle du moteur : la ligne `docs-relied-on:` de la matrice liste au moins un fichier de `docs/adr`, `docs/architecture`, `docs/domain/event-model` ou `docs/features`, ou un `.feature` là où son composant le garde, et chaque fichier listé existe dans la copie de travail |
| Contrôles du moteur | traces DESIGN après chaque tentative : matrice de cohérence `consistency-gate: PASS` (G10), aucun ADR nommé `*-rejected.md`, `*-accepted.md`, `*-deprecated.md` ou `*-superseded.md` (G14), chaque `**Supersedes:**` avec sa ligne de registre (G2, G12), la ligne `docs-relied-on:` de la matrice (fichiers des dossiers durables de `docs/`, et les `.feature` là où leur composant les garde, qui existent) ; une ligne d'index pour chaque ADR écrit (`design-records`) ; ADR brouillons : `Proposed`, aucune version, aucun fichier de code, identifiant de critère d'acceptation, ticket ni autre ADR cité (seulement l'ADR qu'il remplace, sur sa ligne `Supersedes:`/`Amends:`), un `decision` d'une phrase, aucun historique de brouillon ; ADR de la base : seules leurs lignes de statut changent, `Accepted` seulement vers `Superseded by ADR-NNN` ou `Deprecated`, jamais supprimés ; un statut du jeu fermé (`adr-lifecycle`) |
| Échec persistant | après la dernière tentative, ou deux tentatives de suite refusées de la même façon, la question `blocked` sur `design` ; `STOP` termine le run avec `missing-outputs` quand la matrice de cohérence manque, `design-records` sinon |

| Lentille | Gates |
| --- | --- |
| `consistency` | G1, G2, G10, G12, G14, C1 |
| `architecture-compliance` | G3, G4, G5, G6, G16 |
| `fitness` | G7, G8, G9, G11, G15, G17, G18, F1 |

| Arête | Étiquette | `max_visits` |
| --- | --- | --- |
| `design_review -> design` | `NEEDS_REWORK` | 2 |
| `design_review -> adr` | `APPROVED` | — |
| `adr -> distill` | `RATIFIED` | — |
| `adr -> design` | `REJECTED` (raison obligatoire, renvoyée à l'architecte) | 1 |

`RATIFIED` passe chaque ADR en `Accepted` (`status: Accepted`, `ratified_by: "human AAAA-MM-JJ"`,
ligne `**Status:**`, ligne de `docs/adr/decisions-index.md`) et les commite seuls en
`docs(adr): ratify ADR-001, ADR-002`. Sans ADR `Proposed`, la question est sautée.

## DISTILL <!-- #distill -->

| Nœud | Type | Rôle |
| --- | --- | --- |
| `distill` | agent `acceptance-designer`, `each="scenario"` | premier passage : chaque scénario de l'histoire, le plan de test et son tableau `## Scenarios`, le test d'acceptation en échec de S1 et son squelette ; puis, avant la livraison de chaque scénario suivant, le test d'acceptation en échec de ce scénario |
| `distill_review` | revue | lentilles `coverage`, `business-alignment`, `testability`, `boundary-enforcement` ; tourne une fois, sur le premier passage |
| `scenario_review` | question `scenario-review` | un humain lit les scénarios et le test d'acceptation de S1 avant que DELIVER les construise |

| | |
| --- | --- |
| Entrées | stories, documents de DESIGN (dans le dossier de suivi et sous `docs/`) ; à partir du deuxième passage, le scénario à écrire (`- Scenario: k of N — "<titre>" (component <c>, tags …)`) |
| Sortie déclarée | `details/{date}/test-plan-{slug}.md` |
| Autres sorties | `details/{date}/impl-plan-{story}.md` ; le `.feature` du dossier propre au composant (`bdd`), en `{bounded-context}/{feature}.feature` (scénarios Gherkin, mots-clés en anglais, non exécutables) ; dans les composants : le test d'acceptation en échec du scénario en cours (chemins `tests`) et le squelette qu'il appelle (chemins `src`) |
| Brief | le scénario en cours, le `git commit` exact de son rouge, et la [politique d'infrastructure](./skraft-config.md#infrastructure) effective de chaque composant |
| Écriture permise | le dossier de suivi, les dossiers features que nomme le `bdd` des composants, les chemins `src` et `tests` de chaque composant, et les fichiers à la racine de ces composants |
| Commits | mode `red`, un au plus par passage : `test(<story>): <titre du scénario>`, le test d'acceptation et son squelette ensemble (au premier passage, avec les scénarios), dans le seul composant du scénario, aucun `feat`, `fix` ni `refactor` ; rejoué, le juge du rejeu exigeant un échec sur une assertion ([Commits et rejeux](./gates.md#commits)) ; un changement des seuls scénarios, hors des chemins `src` et `tests` des composants, dans un commit `docs(<story>): …` ; un changement laissé non commité est refusé (`uncommitted`) |
| Contrôles du moteur | emplacement des fichiers de test ajoutés (`testability#layout`, G11) ; le tableau `## Scenarios` du plan de test ([plus bas](#scenarios), `scenarios`) ; les scénarios que nomme le plan de test (`gherkin-records`) : chaque `.feature` cité dans sa matrice de couverture est un fichier d'un dossier que le `bdd` du composant nomme, dont chaque scénario dit Given, When et Then, remplit depuis ses exemples chaque placeholder qu'il ouvre, et porte un titre unique dans son fichier ; et l'histoire tient au moins un scénario par critère d'acceptation de son `ac-draft-{story}.md`. Une ligne de la matrice de couverture qui ne nomme aucun Gherkin écrit `—`, et une histoire dont l'`ac-draft` ne déclare aucun critère ne se voit demander aucun scénario. Le contrôle ne tourne que là où un composant déclare `bdd` : celui qui écrit ses tests sans Gherkin ne se voit demander aucun `.feature`, et un composant qui n'a tranché ni dans un sens ni dans l'autre refuse le run avant son premier agent. Les mots-clés sont en anglais, quelle que soit la langue des phrases : un `.feature` qui déclare une autre langue est renvoyé en la nommant |

| Lentille | Gates |
| --- | --- |
| `coverage` | G1, G2 |
| `business-alignment` | G3, G4, B1 |
| `testability` | G5, G6, G11, T1, T2, T3 |
| `boundary-enforcement` | G7, G8, E1, E2 |

| Arête | Étiquette | `max_visits` |
| --- | --- | --- |
| `distill_review -> distill` | `NEEDS_REWORK` | 2 |
| `distill_review -> scenario_review` | `APPROVED` | — |
| `scenario_review -> deliver` | `APPROVED` | — |
| `scenario_review -> distill` | `REVISE` (corrections exigées, renvoyées à l'acceptance designer) | 2 |

Après `APPROVED`, aucune arête ne mène les scénarios : le moteur lance `deliver` sur S1, puis
`distill` sur S2 et `deliver` sur S2, et ainsi de suite, chaque passage étant une visite à part ;
après le dernier scénario, `deliver` sort par son arête vers `gates`. Un passage de `distill`
après le premier n'est pas revu. Un run interrompu reprend au scénario en cours.

### Le tableau `## Scenarios` <!-- #scenarios -->

Le plan de test liste les scénarios dans l'ordre où DELIVER les construit :

```text
## Scenarios

| # | Scenario | Component | Tags |
|---|---|---|---|
| S1 | Customer pays an order by card | api | @walking-skeleton @happy-path |
| S2 | Customer is refused an expired card | api | @error-case |

Walking skeleton exemption: none
```

| Règle | Refusé avec |
| --- | --- |
| pas de titre `## Scenarios` suivi d'un tableau aux colonnes `#`, `Scenario`, `Component`, `Tags` | `<plan> lists no scenario: write …` |
| identifiants `S1`, `S2`, … dans l'ordre des lignes | `<plan>: row <n> is not S<n>; number the scenarios S1, S2, … in the order DELIVER builds them` |
| un titre sur chaque ligne, jamais deux fois | `<plan>: S<n> has no title` ; `<plan>: two scenarios are titled "<titre>"` |
| `Component` : un nom de composant de `skraft-config.json` | `<plan>: S<n> names component "<c>", which is none of <composants>` |
| exemption `none` (défaut quand la ligne manque) : S1, et S1 seul, tagué `@walking-skeleton` | `<plan>: tag S1, and S1 only, @walking-skeleton, or declare "Walking skeleton exemption: library \| refactoring \| docs-only"` |
| le walking skeleton dans un composant qui n'est pas `react` | `<plan>: the walking skeleton S1 runs in a back-end component; <c> is a react front end` |
| exemption `library`, `refactoring` ou `docs-only` : aucun scénario tagué `@walking-skeleton` | `<plan>: the story declares its walking skeleton exempt (<exemption>), and S<n> carries @walking-skeleton` |
| toute autre exemption | `<plan>: walking skeleton exemption "<valeur>" must be none, library, refactoring, docs-only` |
| `docs-only` : aucun commit de l'histoire ne change les chemins `src` d'un composant | `the story declares its walking skeleton exempt as docs only, and commit <sha> changes <fichier>, source of <composant>; remove the exemption and tag S1 @walking-skeleton` |

Chaque échec renvoie l'agent du passage avec la ligne ; après sa dernière tentative, ou deux
tentatives de suite refusées de la même façon, le run pose la question `blocked`, et `STOP` le
termine avec `scenarios`. Pourquoi S1 est un walking skeleton :
[Walking Skeleton](../explanation/deep-dive/walking-skeleton.md).

## DELIVER <!-- #deliver -->

| Nœud | Type | Rôle |
| --- | --- | --- |
| `deliver` | agent `software-engineer`, `each="scenario"` | fait passer chaque scénario à son tour, un commit vert chacun ; après le dernier, les passages que renvoient les gates ou la revue, sur toute l'histoire |
| `gates` | gates `build,format,lint,test,architecture,coverage`, `goal_gate`, `locked` | commandes des composants modifiés, puis de tous |
| `deliver_review` | appel `workflow="review"` | lentilles `test-integrity`, `architecture-boundaries`, `cold-reader`, `mock-fidelity` (`when="mock"`), `contract-fidelity` (`when="contract"`) |
| `mutation` | gate `mutation`, `goal_gate`, `locked` | une fois, sur le code que `deliver_review` a approuvé ; barre 100 % cœur (Domain, Application), 80 % frontière |
| `kill_proposal` | agent `software-engineer`, `each="survivor-file"`, `proposal=true` | un lancement par fichier portant des mutants survivants ; écrit une proposition, ne change aucun code |
| `mutation_plan` | question `mutation-plan` | le développeur choisit : `APPLY`, sa propre consigne, ou `STOP` |
| `kill_mutants` | agent `software-engineer`, `each="survivor-file"` | applique le choix, en un lancement |
| `mutation_review` | revue | lentille `test-integrity` |
| `mutation_gates` | gates `build,format,lint,test,architecture,coverage`, `goal_gate` | relance les gates après `kill_mutants`, avant une nouvelle mutation |
| `visuals` | publication `playwright-visuals`, `when="frontend"` | commande `e2e` de chaque front end, captures commitées |

| | |
| --- | --- |
| Brief sur un scénario | le scénario (`- Scenario: k of N — "<titre>" (component <c>, tags …)`) ; les tests d'acceptation que DISTILL a commités jusque-là (`<sha> "<sujet>": <fichiers>`), que l'agent ne change jamais (s'il en trouve un faux, il s'arrête `blocked` en le nommant) ; le commit, exactement : `<commande de test> && git add <chaque fichier changé> && git commit -s -m "feat(<story>): <titre>" -m "Refs: #<issue>"` |
| Sortie déclarée | `changes/{date}/change-log.md` |
| Propositions | `proposals/kill_proposal-<visite>-g<n>.md`, une par fichier de survivants, créée par le moteur avec une section par mutant ; chaque ligne `{{outcome}}` devient `test: …`, `delete: …` ou `equivalent: …` |
| Preuves | `gates/<composant>/<gate>-<n>.log` ; `visuals/<composant>/e2e-<n>.log` |
| Écriture permise | `deliver`, `kill_mutants` : le dossier de suivi, les chemins `src` et `tests` de chaque composant, et les fichiers à leur racine ; `kill_proposal` : le dossier de suivi seulement, donc rien à commiter ; un changement hors de lui est refusé |
| Commits | `deliver` sur un scénario : exactement un `feat(<story>): <titre du scénario>` (ou `fix`), enchaîné en bash à la commande de test comme l'écrit le brief ; aucun commit `test`, `refactor`, `style` ni `perf`, la boucle TDD interne restant non commitée ; aucun changement aux tests d'acceptation du scénario hors des chemins `src` du composant, ni à un autre composant ; le moteur y rejoue les tests et le juge du rejeu décide ([Commits et rejeux](./gates.md#commits)). `deliver` renvoyé par les gates ou la revue : chaque `feat` ou `fix` après un `test(<story>): …` depuis le dernier vert, l'échec des gates tenant lieu de ce rouge sur un passage qu'elles ont renvoyé, `refactor` permis, rouges non rejoués. `kill_mutants` en mode `kill` : des tests qui tuent les mutants et passent. Chaque message conventionnel finit par `Refs: #<issue>` et ne ferme aucune issue ; un changement laissé non commité est refusé (`uncommitted`) |
| Barre de mutation | 100 % sur le cœur, 80 % sur la frontière ; non configurable |

| Réponse à `mutation-plan` | Effet |
| --- | --- |
| `APPLY` | `kill_mutants` reçoit `Apply the proposals in <chemins>` |
| une consigne | `kill_mutants` reçoit la consigne et les propositions dont elle s'écarte |
| `STOP` | `run.finished` `blocked`, code `stopped` |

| Lentille (`review`) | Gates |
| --- | --- |
| `test-integrity` | G7, G9 ; plus les findings G9 que le moteur lit dans le patch (`test-integrity#patch`) |
| `architecture-boundaries` | G4, G5, G10 |
| `cold-reader` | G11 |
| `mock-fidelity` | M1, M2, M3, M4 |
| `contract-fidelity` | K1, K2, K3, K4, K5 |

| Arête | Étiquette | `max_visits` |
| --- | --- | --- |
| `gates -> deliver` | `FAIL` | 3 |
| `gates -> deliver_review` | `PASS` | — |
| `deliver_review -> deliver` | `NEEDS_REWORK` | 2 |
| `deliver_review -> mutation` | `APPROVED` | — |
| `mutation -> visuals` | `PASS` | — |
| `mutation -> kill_proposal` | `FAIL` | 5 |
| `kill_proposal -> mutation_plan` | — | — |
| `mutation_plan -> kill_mutants` | `APPLY` (une consigne suit aussi cette arête) | — |
| `mutation_review -> kill_mutants` | `NEEDS_REWORK` | 2 |
| `mutation_review -> mutation_gates` | `APPROVED` | — |
| `mutation_gates -> kill_mutants` | `FAIL` | 3 |
| `mutation_gates -> mutation` | `PASS` | — |

## PUBLISH <!-- #publish -->

| Nœud | Type | Rôle |
| --- | --- | --- |
| `pr_writer` | agent `pr-writer` | prose de la pull request |
| `publish` | publication `pull-request` | pousse la branche, ouvre ou met à jour la pull request |

| | |
| --- | --- |
| Sortie déclarée | `details/{date}/pull-request-prose-{slug}.md`, pré-créé depuis `pull-request-prose.<langue>.template.md` (`en` ou `fr`, la langue de la story) |
| Écriture permise | le dossier de suivi seulement |
| Contrôle du moteur | ligne de résumé d'au plus 72 caractères, aucune section vide |
| Publication | avec `publish.pullRequest` accepté : pull request en brouillon (sauf `publish.draft: false`), décrite depuis le journal ; sans consentement, remote ou `gh` : `pull-request.md` reste, et `skraft publish` l'ouvre plus tard |
| Fin | `run.finished` `completed`, raison `PUBLISH closed` |

## Questions à un humain <!-- #human-questions -->

| Question | Posée par | Options | Refus (raison obligatoire) | En-tête |
| --- | --- | --- | --- | --- |
| `adr-ratification` | nœud `adr` | `RATIFIED`, `REJECTED` | `REJECTED` | `ADR` |
| `scenario-review` | nœud `scenario_review` | `APPROVED`, `REVISE` | `REVISE` | `Scenarios` |
| `mutation-plan` | nœud `mutation_plan` | `APPLY`, une consigne, ou `STOP` | — | `Mutation` |
| `environment` | le moteur, quand une étape ne peut pas tourner sur la machine ou avec ce que lui donne `skraft-config.json`, ou quand le juge du rejeu interroge un humain sur un commit rejoué ; son texte nomme la cause et le log ([causes](./run-journal.md#environment-question)) | `RETRY`, `ABORT` | — | `Environment` |
| `blocked` | le moteur, quand un agent répond `blocked`, qu'un agent est refusé de la même façon à deux tentatives de suite ou à sa dernière tentative, qu'une boucle atteint son `max_visits` ou qu'une lentille répond `inconclusive` | une consigne, ou `STOP` | — | `Blocked` |
| `review-consent` | `skraft review --pr --publish` | `ACCEPTED`, `DECLINED` | — | `PR comment` |

Aucun run ne demande de consentement de publication : `/skraft-init` les règle avant tout run,
dans `skraft-config.json` (`publish.pullRequest`, `publish.visuals`, chacun avec la version de la
question auquel il répond sous `publish.questionVersions`). Un run dont le workflow publie est
refusé avant son premier agent tant qu'un consentement dont il a besoin est sans réponse, ou
répond à une version antérieure de sa question ; `publish.visuals` n'est nécessaire que si un
composant est un front end. Clés, réponses et journal :
[Dossier de suivi et journal](./run-journal.md#human-questions).

## Voir aussi <!-- #see-also -->

- [Le pipeline SKRAFT](../explanation/pipeline/index.mdx)
- [Le workflow DOT](./workflow-dot.mdx)
- [Gates](./gates.md)
- [Dossier de suivi et journal](./run-journal.md)
- [Catalogue des agents et skills](pathname:///dashboard/)

Termes à connaître : **phase**, **lentille**, **gate**, **ADR**, **DoR** — voir le
[glossaire](./glossary.md).
