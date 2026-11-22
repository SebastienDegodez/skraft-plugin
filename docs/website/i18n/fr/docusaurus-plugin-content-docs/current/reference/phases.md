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
| DISTILL | `skraft` | le moteur | `acceptance-designer` | tableau `## Scenarios`, groupes de livraison, un commit rouge, revue à 4 lentilles | `scenario-review` |
| DELIVER | `skraft` | le moteur | `software-engineer` | un seul commit vert pour l'histoire, les groupes travaillés dans l'ordre du plan, en un passage, ses gates lancées et tracées ; revue `review` | — |
| PUBLISH | `skraft` | le moteur | `pr-writer` | prose de la pull request | — |

DISCOVER et DISCUSS ne passent pas par le moteur : aucun journal, aucune exécution de gate.
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
| `distill` | agent `acceptance-designer` | un passage : chaque scénario de l'histoire, le plan de test et son tableau `## Scenarios`, le plan d'implémentation et son tableau `| Group | Scenarios |`, le [walking skeleton](../explanation/deep-dive/walking-skeleton.md) en échec, le test d'acceptation en échec de chaque scénario et le squelette qu'ils appellent |
| `distill_review` | revue | lentilles `coverage`, `business-alignment`, `testability`, `boundary-enforcement` ; elles jugent les critères, la forme du Gherkin, le tag walking skeleton et les groupes ; tourne une fois, après le passage |
| `scenario_review` | question `scenario-review` | un humain lit les scénarios, leurs groupes et le rouge de leurs tests (ou l'exemption) avant que DELIVER les construise |

| | |
| --- | --- |
| Entrées | stories, documents de DESIGN (dans le dossier de suivi et sous `docs/`) |
| Sortie déclarée | `details/{date}/test-plan-{slug}.md` |
| Autres sorties | `details/{date}/impl-plan-{story}.md`, son tableau `| Group | Scenarios | Rule | … |` (sans tableau : un scénario par groupe) ; le `.feature` du dossier propre au composant (`bdd`), en `{bounded-context}/{feature}.feature` (scénarios Gherkin, mots-clés en anglais) ; dans les composants : le walking skeleton en échec (place des tests d'intégration, chemins `tests`), le test d'acceptation en échec de chaque scénario, son nom commençant par le numéro du scénario (place des tests unitaires, chemins `tests`), et le squelette qu'ils appellent (chemins `src`) |
| Brief | le `git commit` exact du rouge, l'instruction de lancer une fois les tests d'acceptation par `skraft_repl` avec l'étiquette `red`, et la [politique d'infrastructure](./skraft-config.md#infrastructure) effective de chaque composant |
| Écriture permise | le dossier de suivi, les dossiers features que nomme le `bdd` des composants, les chemins `src` et `tests` de chaque composant, et les fichiers à la racine de ces composants |
| Commits | mode `red`, un par passage : `test(<story>): acceptance tests S1–S<n>`, le walking skeleton, chaque test d'acceptation, le squelette qu'ils appellent et le `.feature` de leurs composants ensemble, dans les seuls composants que nomment les scénarios, aucun `feat`, `fix` ni `refactor` (une histoire exemptée de walking skeleton commite ses seuls tests d'acceptation)  ([Commits](./gates.md#commits)) ; le moteur ne lance aucun test ; un changement des seuls scénarios, hors des chemins `src` et `tests` des composants, dans un commit `docs(<story>): …` ; un changement laissé non commité est refusé (`uncommitted`) |
| Contrôles du moteur | un passage sans rouge commité, ni d'un passage précédent (`the story has no failing acceptance tests committed: …`) ; un groupe du plan d'implémentation qui ne nomme aucun scénario (`scenarios`) ; emplacement des fichiers de test ajoutés (`testability#layout`, G11) ; le tableau `## Scenarios` du plan de test, lu et refusé seulement quand il est illisible ([plus bas](#scenarios), `scenarios`). Non contrôlés par le moteur : les critères d'acceptation face aux scénarios (G1) et la forme du Gherkin (T4), que les lentilles jugent. Un composant qui n'a tranché ni dans un sens ni dans l'autre sur `bdd` refuse le run avant son premier agent |

| Lentille | Gates |
| --- | --- |
| `coverage` | G1, G2 |
| `business-alignment` | G3, G4, B1 |
| `testability` | G5, G6, G11, T1, T2, T3, T4 |
| `boundary-enforcement` | G7, G8, E1, E2 |

| Arête | Étiquette | `max_visits` |
| --- | --- | --- |
| `distill_review -> distill` | `NEEDS_REWORK` | 2 |
| `distill_review -> scenario_review` | `APPROVED` | — |
| `scenario_review -> deliver` | `APPROVED` | — |
| `scenario_review -> distill` | `REVISE` (corrections exigées, renvoyées à l'acceptance designer) | 2 |

Après `APPROVED`, aucune arête ne mène les groupes : le moteur lance `deliver` une seule fois
pour l'histoire, le software engineer travaillant les groupes dans l'ordre du plan ; `deliver` sort ensuite par son arête vers `deliver_review`.

### Le tableau `## Scenarios` <!-- #scenarios -->

Le plan de test liste les scénarios dans l'ordre où DELIVER les construit :

```text
## Scenarios

| # | Scenario | Component | Tags |
|---|---|---|---|
| S1 | Customer pays an order by card | api | @walking-skeleton @happy-path @AC-1 |
| S2 | Customer is refused an expired card | api | @error-case @AC-2 |

Walking skeleton exemption: none
```

| Règle | Refusé avec |
| --- | --- |
| un titre `## Scenarios` suivi d'un tableau aux colonnes `#`, `Scenario`, `Component`, `Tags` | `<plan> lists no scenario: write …` |
| identifiants `S1`, `S2`, … dans l'ordre des lignes | `<plan>: row <n> is not S<n>; number the scenarios S1, S2, … in the order DELIVER builds them` |
| un titre sur chaque ligne | `<plan>: S<n> has no title` |
| `Component` : un nom de composant de `skraft-config.json` | `<plan>: S<n> names component "<c>", which is none of <composants>` |

Le moteur ne lit rien de plus du tableau. Que S1 seul soit tagué `@walking-skeleton`, que le walking skeleton
soit dans un composant back, qu'une exemption (`library`, `refactoring`, `docs-only`) soit valide et
confirmée par les commits de l'histoire, que deux lignes partagent un titre : ce sont les lentilles `boundary-enforcement` (G8) et
`testability` (G6) qui en jugent.

Le plan d'implémentation à côté (`impl-plan-…` pour `test-plan-…`) regroupe les scénarios que
DELIVER fait passer, dans son ordre, sous n'importe quel titre ; le tableau donne l'ordre de travail, et l'histoire prend un seul commit vert :

```text
| Group | Scenarios | Rule |
|---|---|---|
| 1 | S1, S2 | paiement par carte |
| 2 | S3–S5 | cartes expirées |
```

Le moteur lit le tableau pour l'ordre de travail de DELIVER et ne le refuse que si un groupe ne nomme aucun scénario
(`<plan>: group <g> names no scenario`). Que chaque scénario soit dans un seul groupe, aucun que le plan de test ne liste pas,
S1 dans le premier groupe : c'est à la lentille `testability` (G6).

Un plan sans tableau aux colonnes `Group` et `Scenarios` travaille un scénario par groupe.

Chaque échec renvoie l'agent du passage avec la ligne ; après sa dernière tentative, ou deux
tentatives de suite refusées de la même façon, le run pose la question `blocked`, et `STOP` le
termine avec `scenarios`. Pourquoi le walking skeleton parcourt S1 :
[Walking Skeleton](../explanation/deep-dive/walking-skeleton.md).

## DELIVER <!-- #deliver -->

| Nœud | Type | Rôle |
| --- | --- | --- |
| `deliver` | agent `software-engineer` | un seul passage par histoire : travaille chaque groupe du plan d'implémentation dans l'ordre du plan et commite un seul vert pour toute l'histoire (un deuxième est refusé, `green-split`) ; ce vert fait passer aussi le walking skeleton ; après le dernier, les passages que renvoie la revue, sur toute l'histoire. L'ingénieur lance chaque gate de chaque composant que l'histoire a modifié par `skraft_repl` ; le moteur journalise les exécutions tracées et la revue DELIVER les juge ([Gates](./gates.md#command-gates)) |
| `deliver_review` | appel `workflow="review"` | lentilles `test-integrity`, `architecture-boundaries`, `cold-reader`, `quality-gates`, `mock-fidelity` (`when="mock"`), `contract-fidelity` (`when="contract"`) |
| `visuals` | publication `playwright-visuals`, `when="frontend"` | commite les captures de la dernière exécution e2e tracée (`gate('e2e', …)`) de chaque front end |

| | |
| --- | --- |
| Brief | les groupes, dans l'ordre où l'ingénieur les travaille (`- <g> of <G> — S1 "<titre>" (component <c>, tags …) ; …`) ; le commit des tests d'acceptation que DISTILL a commités, walking skeleton compris (`<sha> "<sujet>": <fichiers>`), que l'agent ne change jamais (s'il en trouve un faux, ou en échec sur une erreur de build ou de setup, il s'arrête `blocked` en le nommant) ; une seule ligne de commit, exactement : `<la commande de test de chaque composant> && git add <chaque fichier changé> && git commit -s -m "feat(<story>): S1–S<n> <les règles de l'histoire>" -m "Refs: #<issue>"`. Un passage que la revue a renvoyé ne liste aucun groupe : seulement les tests d'acceptation qu'il ne change jamais, et les règles de commit du cycle |
| Sortie déclarée | `changes/{date}/change-log.md` |
| Preuves | `logs/runs/<step>-<visit>-<attempt>/runs.jsonl` et les logs des exécutions tracées, remis à la revue ; l'`evidence.checked` du journal ([Gates](./gates.md#command-gates)) ; `visuals/<composant>/e2e-<n>.log` |
| Écriture permise | le dossier de suivi, les chemins `src` et `tests` de chaque composant, et les fichiers à leur racine ; un changement hors de lui est refusé |
| Commits | `deliver`, passage de l'histoire : un seul `feat(<story>): …` (ou `fix`) pour toute l'histoire, quoi que nomme son sujet, enchaîné à la commande de test comme l'écrit le brief, pour sh ou PowerShell 7 et pour Windows PowerShell 5.1 ; aucun commit `test`, `refactor`, `style` ni `perf`, la boucle TDD interne restant non commitée ; aucun changement aux tests d'acceptation ni au walking skeleton hors des chemins `src` du composant ; le moteur ne lance aucun test ([Commits](./gates.md#commits)). `deliver` renvoyé par la revue : chaque cycle un `feat` ou `fix` qui porte son test et son code, sans commit `test(<story>): …` à part (`test-apart`, `green-without-test`), `refactor` permis. Un journal DELIVER d'une alpha V2 antérieure, un passage par groupe, n'est pas repris. Chaque message conventionnel finit par `Refs: #<issue>` et ne ferme aucune issue ; un changement laissé non commité est refusé (`uncommitted`) |
| Mutation | aucune : ni le pipeline ni le moteur ne lancent la mutation ; c'est une recette de la session du développeur ([Lancer la mutation](../how-to/run-mutation.md)) |

| Lentille (`review`) | Gates |
| --- | --- |
| `test-integrity` | G7, G9 ; plus les findings G9 que le moteur lit dans le patch (`test-integrity#patch`) |
| `architecture-boundaries` | G4, G5, G10 |
| `cold-reader` | G11 |
| `quality-gates` | Q1, Q2, Q3, Q4 |
| `mock-fidelity` | M1, M2, M3, M4 |
| `contract-fidelity` | K1, K2, K3, K4, K5 |

| Arête | Étiquette | `max_visits` |
| --- | --- | --- |
| `deliver_review -> deliver` | `NEEDS_REWORK` | 2 |
| `deliver_review -> visuals` | `APPROVED` | — |

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
| `environment` | le moteur, quand une étape ne peut pas tourner sur la machine ou avec ce que lui donne `skraft-config.json` ; son texte nomme la cause et le log ([causes](./run-journal.md#environment-question)) | `RETRY`, `ABORT` | — | `Environment` |
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
