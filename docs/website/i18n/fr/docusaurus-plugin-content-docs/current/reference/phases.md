---
title: "Phases"
description: "Chaque phase, de DISCOVER à PUBLISH : qui la conduit, ses entrées, ses sorties et leurs chemins, ses agents, ses lentilles et gates, ses arêtes de retour et les décisions humaines qu'elle demande."
persona: software-engineer
---

# Phases

Pour chaque phase : ce qui entre, ce qui sort et où, qui produit, qui vérifie, et ce qu'un humain décide.

Le rôle de chaque phase dans le parcours et le choix entre les parcours :
[Le pipeline SKRAFT](../explanation/pipeline/index.md). La syntaxe du workflow
qui les enchaîne : [Le workflow DOT](./workflow-dot.md). Le
détail de chaque gate citée : [Gates](./gates.md).

## Vue d'ensemble <!-- #overview -->

| Phase | Plugin | Conduite par | Agent producteur | Vérification | Décision humaine |
| --- | --- | --- | --- | --- | --- |
| DISCOVER | `skraft-backlog` | l'agent, lancé par le développeur | `backlog-discoverer` | 3 lentilles, verdict de `review-verdict.mjs` | dépôt cible, capacité |
| DISCUSS | `skraft-backlog` | l'agent, lancé par le développeur | `backlog-planner` | 4 lentilles, verdict de `review-verdict.mjs` | — |
| RESEARCH | `skraft` | le moteur | `solution-researcher` | sortie remplie | consentements `publish-consent`, `reporting-consent` |
| DESIGN | `skraft` | le moteur | `solution-architect` | traces DESIGN, scan structurel, revue à 3 lentilles | `adr-ratification` |
| DISTILL | `skraft` | le moteur | `acceptance-designer` | commits rouges rejoués, revue à 4 lentilles | — |
| DELIVER | `skraft` | le moteur | `software-engineer` | commits TDD, gates, revue `review`, mutation | `mutation-plan` quand la mutation échoue |
| PUBLISH | `skraft` | le moteur | `pr-writer` | prose de la pull request | — |

DISCOVER et DISCUSS ne passent pas par le moteur : aucun journal, aucune gate de commandes.
Les phases RESEARCH à PUBLISH sont celles de `workflows/pipeline.skraft.dot` ; un workflow
éjecté peut en ajouter. À toute phase du moteur, un humain peut recevoir les questions
`environment` et `blocked` ([ci-dessous](#human-questions)).

Tous les chemins relatifs sont sous le dossier de suivi
`.copilot-tracking/skraft-plans/<slug>/` ; `{date}` est un dossier `AAAA-MM-JJ`. Un chemin qui
commence par `docs/` est dans le dépôt, hors du dossier de suivi : c'est la documentation durable
du dépôt ([Documentation durable](./run-journal.md#durable-docs)).

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
| `publish_consent` | question `publish-consent` | consentement à pousser la branche, ouvrir la pull request, commenter l'issue |
| `visuals_consent` | question `reporting-consent` | consentement à publier captures et vidéos d'un front end |
| `research` | agent `solution-researcher` | le document de recherche |

| | |
| --- | --- |
| Entrées | la story (`plans/{date}/issue-<numéro>.md` quand le run a démarré avec `--issue`) ; la documentation durable sous `docs/`, lue d'abord |
| Sortie | `research/{date}/{slug}-research.md`, pré-créé depuis `research.template.md` |
| Écriture permise | le dossier de suivi seulement |
| `docs/` couvre déjà la story | le document de recherche le dit et cite les fichiers de `docs/` ; le moteur contrôle seulement que le document existe |
| Contrôle | sortie remplie : non vide, différente du gabarit, sans `{{…}}` |
| Tentatives | 3 (défaut de `max_attempts`) ; ensuite `missing-outputs` |

## DESIGN <!-- #design -->

| Nœud | Type | Rôle |
| --- | --- | --- |
| `design` | agent `solution-architect` | modèle d'événements, conception stratégique et tactique, ADR, contrats, matrice de cohérence |
| `design_review` | revue | lentilles `consistency`, `architecture-compliance`, `fitness` |
| `adr` | question `adr-ratification` | ratification des ADR `Proposed` |

| | |
| --- | --- |
| Entrées | la documentation durable sous `docs/`, lue d'abord ; document de recherche ; `details/{date}/structural-scan.json`, écrit par le moteur avant chaque tentative ; story |
| Sortie déclarée | `details/{date}/consistency-matrix-{slug}.md` |
| Autres sorties | dans le dossier de suivi : `details/{date}/contracts-{story}.md`, `supersession-plan-{story}.md` (quand un ADR `Accepted` est remplacé) ; dans le dépôt : `docs/architecture/context-map.md`, `docs/architecture/{bounded-context}.md` (conception tactique), `docs/domain/event-model/{bounded-context}.md`, `docs/adr/adr-{NNN}-{sujet}.md`, `docs/adr/decisions-index.md`, `docs/adr/supersessions.md` |
| Écriture permise | le dossier de suivi, `docs/adr/`, `docs/architecture/` et `docs/domain/event-model/` |
| Documentation existante | consigne à l'agent : un fichier de `docs/` est complété, pas réécrit. Quand `docs/` couvre déjà la story, la matrice de cohérence le dit et cite les fichiers de `docs/`, et la phase passe à la suite. Contrôle du moteur : la ligne `docs-relied-on:` de la matrice liste au moins un fichier de `docs/adr`, `docs/architecture`, `docs/domain/event-model` ou `docs/features`, et chaque fichier listé existe dans la copie de travail |
| Contrôles du moteur | traces DESIGN après chaque tentative : matrice de cohérence `consistency-gate: PASS` (G10), aucun ADR nommé `*-rejected.md`, `*-accepted.md`, `*-deprecated.md` ou `*-superseded.md` (G14), chaque `**Supersedes:**` avec sa ligne de registre (G2, G12), la ligne `docs-relied-on:` de la matrice (fichiers des dossiers durables de `docs/` qui existent) ; une ligne d'index pour chaque ADR écrit (`design-records`) ; ADR brouillons : `Proposed`, aucune version, un `decision` d'une phrase, aucun historique de brouillon ; ADR de la base : seules leurs lignes de statut changent, jamais supprimés ; un statut du jeu fermé (`adr-lifecycle`) |
| Échec persistant | `missing-outputs` quand la matrice de cohérence manque après la dernière tentative, `design-records` sinon |

| Lentille | Gates |
| --- | --- |
| `consistency` | G1, G2, G10, G12, G14, C1 |
| `architecture-compliance` | G3, G4, G5, G6, G16 |
| `fitness` | G7, G8, G9, G11, G15, G17, G18, F1 |

| Arête | Étiquette | `max_visits` |
| --- | --- | --- |
| `design_review -> design` | `NEEDS_REWORK` | 1 |
| `design_review -> adr` | `APPROVED` | — |
| `adr -> distill` | `RATIFIED` | — |
| `adr -> design` | `REJECTED` (raison obligatoire, renvoyée à l'architecte) | 1 |

`RATIFIED` passe chaque ADR en `Accepted` (`status: Accepted`, `ratified_by: "human AAAA-MM-JJ"`,
ligne `**Status:**`, ligne de `docs/adr/decisions-index.md`) et les commite seuls en
`docs(adr): ratify ADR-001, ADR-002`. Sans ADR `Proposed`, la question est sautée.

## DISTILL <!-- #distill -->

| Nœud | Type | Rôle |
| --- | --- | --- |
| `distill` | agent `acceptance-designer` | scénarios, plan de test, tests d'acceptation en échec et squelette |
| `distill_review` | revue | lentilles `coverage`, `business-alignment`, `testability`, `boundary-enforcement` |

| | |
| --- | --- |
| Entrées | stories, documents de DESIGN (dans le dossier de suivi et sous `docs/`) |
| Sortie déclarée | `details/{date}/test-plan-{slug}.md` |
| Autres sorties | `details/{date}/impl-plan-{story}.md` ; `docs/features/{bounded-context}/{feature}.feature` (scénarios Gherkin, non exécutables) ; dans les composants : tests d'acceptation en échec (chemins `tests`) et squelette appelé par eux (chemins `src`) |
| Écriture permise | le dossier de suivi, `docs/features/`, les chemins `src` et `tests` de chaque composant, et les fichiers à la racine de ces composants |
| Commits | mode `red` : seulement des commits `test(<story>): …` en échec, chacun rejoué par la commande `test` de son composant ([`tdd.replay`](./skraft-config.md#tdd)) |
| Contrôle du moteur | emplacement des fichiers de test ajoutés (`testability#layout`, G11) |

| Lentille | Gates |
| --- | --- |
| `coverage` | G1, G2 |
| `business-alignment` | G3, G4, B1 |
| `testability` | G5, G6, G11, T1, T2, T3 |
| `boundary-enforcement` | G7, G8, E1, E2 |

| Arête | Étiquette | `max_visits` |
| --- | --- | --- |
| `distill_review -> distill` | `NEEDS_REWORK` | 3 |
| `distill_review -> deliver` | `APPROVED` | — |

## DELIVER <!-- #deliver -->

| Nœud | Type | Rôle |
| --- | --- | --- |
| `deliver` | agent `software-engineer` | code de la story, en cycles rouge / vert |
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
| Sortie déclarée | `changes/{date}/change-log.md` |
| Propositions | `proposals/kill_proposal-<visite>-g<n>.md`, une par fichier de survivants, créée par le moteur avec une section par mutant ; chaque ligne `{{outcome}}` devient `test: …`, `delete: …` ou `equivalent: …` |
| Preuves | `gates/<composant>/<gate>-<n>.log` ; `visuals/<composant>/e2e-<n>.log` |
| Écriture permise | `deliver`, `kill_mutants` : le dossier de suivi, les chemins `src` et `tests` de chaque composant, et les fichiers à leur racine ; `kill_proposal` : le dossier de suivi seulement, aucun commit |
| Commits | `deliver` en mode `cycle` : `test(<story>): …` en échec (rouge, rejoué), puis `feat` ou `fix` (vert), `refactor` ; `kill_mutants` en mode `kill` : des tests qui tuent les mutants et passent ; chaque message conventionnel finit par `Refs: #<issue>` et ne ferme aucune issue |
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
| `deliver_review -> deliver` | `NEEDS_REWORK` | 3 |
| `deliver_review -> mutation` | `APPROVED` | — |
| `mutation -> visuals` | `PASS` | — |
| `mutation -> kill_proposal` | `FAIL` | 5 |
| `kill_proposal -> mutation_plan` | — | — |
| `mutation_plan -> kill_mutants` | `APPLY` (une consigne suit aussi cette arête) | — |
| `mutation_review -> kill_mutants` | `NEEDS_REWORK` | 3 |
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
| Sortie déclarée | `details/{date}/pull-request-prose-{slug}.md`, pré-créé depuis `pull-request-prose.template.md` |
| Écriture permise | le dossier de suivi seulement |
| Contrôle du moteur | ligne de résumé d'au plus 72 caractères, aucune section vide |
| Publication | avec `publish.pullRequest` accepté : pull request en brouillon (sauf `publish.draft: false`), décrite depuis le journal ; sans consentement, remote ou `gh` : `pull-request.md` reste, et `skraft publish` l'ouvre plus tard |
| Fin | `run.finished` `completed`, raison `PUBLISH closed` |

## Questions à un humain <!-- #human-questions -->

| Question | Posée par | Options | Refus (raison obligatoire) | En-tête |
| --- | --- | --- | --- | --- |
| `publish-consent` | nœud `publish_consent` | `ACCEPTED`, `DECLINED` | — | `Pull request` |
| `reporting-consent` | nœud `visuals_consent` | `ACCEPTED`, `DECLINED` | — | `Reporting` |
| `adr-ratification` | nœud `adr` | `RATIFIED`, `REJECTED` | `REJECTED` | `ADR` |
| `mutation-plan` | nœud `mutation_plan` | `APPLY`, une consigne, ou `STOP` | — | `Mutation plan` |
| `environment` | le moteur, quand une étape ne peut pas tourner sur la machine | `RETRY`, `ABORT` | — | `Environment` |
| `blocked` | le moteur, quand un agent répond `blocked`, qu'une boucle atteint son `max_visits` ou qu'une lentille répond `inconclusive` | une consigne, ou `STOP` | — | `Blocked` |
| `review-consent` | `skraft review --pr --publish` | `ACCEPTED`, `DECLINED` | — | `Review comment` |

Un consentement déjà donné dans `skraft-config.json` (`publish.pullRequest`,
`publish.visuals`) n'est pas reposé, sauf si le texte de sa question a changé depuis
(`publish.questionVersions`). `reporting-consent` est sauté quand aucun composant n'est un front
end. Clés, réponses et journal : [Dossier de suivi et journal](./run-journal.md#human-questions).

## Voir aussi <!-- #see-also -->

- [Le pipeline SKRAFT](../explanation/pipeline/index.md)
- [Le workflow DOT](./workflow-dot.md)
- [Gates](./gates.md)
- [Dossier de suivi et journal](./run-journal.md)
- [Catalogue des agents et skills](pathname:///fr/dashboard/)

Termes à connaître : **phase**, **lentille**, **gate**, **ADR**, **DoR** — voir le
[glossaire](./glossary.md).
