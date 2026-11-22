---
title: "Dossier de suivi et journal"
description: "Dossier de suivi, .active-slug, journal chaîné et signé events.jsonl, questions posées par un run, statuts et codes."
persona: software-engineer
---

# Dossier de suivi et journal

Tout ce que sait un run tient dans un dossier du dépôt et un journal chaîné ; le moteur recalcule l'état depuis le journal à chaque lecture et ne stocke rien d'autre. Pourquoi un journal plutôt qu'un fichier d'état : [Le journal d'événements](../explanation/event-journal.md), qui détaille aussi la chaîne, la signature et la reprise.

## Arborescence <!-- #layout -->

Le dossier de suivi vit dans la copie de travail qui lance le run. Un **slug** (kebab-case) nomme un pipeline et un dossier.

```
.copilot-tracking/skraft-plans/
├── .active-slug                      le pipeline actif de la copie de travail
└── <slug>/
    ├── .lock                         bail de la session qui conduit le run
    ├── events.jsonl                  journal chaîné et signé
    ├── run-report.md, qa-report.md, WORKFLOW.md, pull-request.md, issue-progress.md
    ├── plans/<date>/                 l'issue de la story, les stories DISCUSS
    ├── research/<date>/<slug>-research.md
    ├── details/<date>/               documents DESIGN, DISTILL et PUBLISH (plan de test, plan d'implémentation, prose)
    ├── changes/<date>/change-log.md  journal des changements DELIVER
    ├── results/                      ce qu'un agent a écrit pour une tentative, briefs et réponses de la boucle
    ├── reviews/<node>-<visit>/       ce que les lentilles d'une passe de revue ont lu, et verdict.yaml
    ├── logs/                         ce que les commandes ont affiché ; logs/runs/<step>-<visit>-<attempt>/ garde les runs tracés
    ├── visuals/<component>/          le dernier run e2e de chaque front
    └── .tmp/                         les fichiers temporaires des agents
```

`results/`, `reviews/`, `logs/` et `.tmp/` ne sont jamais des documents d'une phase : aucune lentille ne les reçoit. Les documents que chaque phase écrit sont listés dans [Phases](./phases.md). Les lentilles n'écrivent aucun fichier : elles rendent des constats, et le moteur écrit `reviews/<node>-<visit>/verdict.yaml` (`status` `APPROVED`, `NEEDS_REWORK` ou `BLOCKED`, les constats qui comptent, les réfutations, les lentilles reprises) à côté d'un `snapshot.json` que la passe suivante compare ([revue incrémentale](./gates.md#incremental)).

## Documentation durable <!-- #durable-docs -->

Certains documents appartiennent au dépôt, pas au run. La phase les écrit sous `docs/` sur la branche de la story : la pull request les montre et les runs suivants les relisent.

| Document | Phase | Chemin |
| --- | --- | --- |
| carte des contextes, conception tactique | DESIGN | `docs/architecture/context-map.md`, `docs/architecture/{bounded-context}.md` |
| modèle d'événements | DESIGN | `docs/domain/event-model/{bounded-context}.md` |
| ADR, index des décisions, registre des remplacements | DESIGN | `docs/adr/` |
| scénarios Gherkin, non exécutables | DISTILL | `{dossier features}/{bounded-context}/{feature}.feature` |

Le document de recherche, la matrice de cohérence, le plan de remplacement, le plan de test, le plan d'implémentation, le journal des changements, la prose de la pull request, le journal et les rapports restent dans le dossier de suivi. RESEARCH et DESIGN lisent `docs/` d'abord et complètent un fichier plutôt que le réécrire (consignes aux agents, pas des contrôles). Le moteur contrôle la ligne `docs-relied-on:` de la matrice de cohérence (au moins un fichier existant de `docs/adr`, `docs/architecture`, `docs/domain/event-model` ou `docs/features`, ou un `.feature`) et le périmètre d'écriture de chaque phase. `cold-reader` ne lit ni les ADR ni ces fichiers. Les lignes de `events.jsonl` ne sont qu'ajoutées ; un ADR publié n'est jamais modifié, un nouvel ADR le remplace.

## `.active-slug` <!-- #active-slug -->

Le slug et un saut de ligne, écrits par `skraft init <slug>`. Les blancs sont retirés ; un contenu qui n'est pas en kebab-case signifie aucun pipeline actif. Toute commande qui agit sur un run le lit et le moteur ne devine jamais un slug. Il est propre à une copie de travail : un worktree Git a le sien.

## `events.jsonl` <!-- #events-jsonl -->

Un objet JSON par ligne. Chaque événement porte `type`, `at` (ISO-8601 UTC) et `prev`, le SHA-256 hexadécimal minuscule de la ligne précédente (`null` sur la première). Chaque ligne se termine par `sig`, le HMAC de la ligne sans ce champ sous la clé du run ; la première ligne nomme la clé par `keyId`, gardée dans `~/.skraft/journal-keys/<keyId>.key` sur la machine qui a lancé le run.

- **Contrôle de la chaîne.** À chaque ouverture du journal, le moteur contrôle chaque ligne. La première rupture donne `journal-tampered` : `journal tampered: events.jsonl line N <détail> ; restore the file or start a new slug` (pas du JSON, n'ouvre pas la chaîne, ne s'enchaîne pas à la ligne N-1, ne nomme aucune clé, n'est pas signée, ne porte pas la signature de la clé du run).
- **Sans la clé** sur cette machine, sans dossier personnel, ou pour un journal écrit avant la signature : `journal-unverifiable`. `skraft journal adopt` écrit une ligne `journal.adopted` (`keyId`, `previousKeyId`, `unverified`) qui nomme une nouvelle clé ; les lignes précédentes restent non vérifiées.
- **Écritures concurrentes.** Avant chaque ajout, le moteur relit le journal ; si une autre écriture est arrivée, il s'arrête avec `journal-changed`.

| `type` | Écrit par | Champs principaux |
| --- | --- | --- |
| `run.started` | init | `slug`, `story`, `workflow`, `base` (`{ component, root, repository, ref, source, sha }` chacune) |
| `step.started` | le pipeline, avant un agent | `step`, `phase`, `agent`, `attempt`, `outputs`, `missing`, `assignment`, `host` ; `sentBy` quand l'étape est renvoyée |
| `step.recorded` | le pipeline, après l'agent | `step`, `attempt`, `outcome`, `missing`, `failures`, `durationMs`, `cost`, `model`, `documents` ; sur les nœuds DISTILL et DELIVER, les scénarios et leurs oracles |
| `question.asked`, `question.answered` | le pipeline, `skraft decide` | `key`, `kind`, `text`, `options` ; `answer`, `reason`, `by` (`host`, `decide`, `host-confirmed`, `cli-tty`) |
| `phase.closed`, `run.finished`, `run.stopped` | le pipeline | `phase` ; `status`, `code`, `reason` |
| `review.lens`, `review.refuted`, `review.noted`, `review.cost` | un nœud de revue | `lens`, `verdict`, `findings`, `fingerprint` ; le verdict du réfuteur par constat |
| `commits.checked` | après une tentative qui a fait des commits | `commits`, chacun `{ repository, sha, subject, kind, verdict }` |
| `evidence.checked` | après une tentative DELIVER | `runs`, chacun `{ run, gate, cwd, log, sha256 }` ; pour une trace qui ne se lit pas jusqu'à ses signatures, `runs: []` et `invalid` (`unsigned-line`, `no-key`, `wrong-signature`) ; `red: true` pour le run rouge du concepteur ([Preuves qualité](#gate-evidence)) |
| `visuals.recorded` | `playwright-visuals` | les captures de chaque front |
| `publish.requested`, `pull-request.opened`, `pull-request.updated`, `pull-request.details-kept`, `pull-request.details-skipped`, `pull-request.screenshots-skipped` | `skraft publish`, le nœud `publish` | `number`, `url`, `bodyHash`, `part` ; `reason`, `screenshots` (les chemins laissés de côté) |
| `issue.commented`, `issue.comment-skipped` | le run | `issue`, `kind`, `url` ou `reason` |
| `lease.reclaimed`, `journal.adopted` | le pipeline, `skraft journal adopt` | `renewed`, `gapMs` ; `keyId`, `unverified` |

Le `verdict` d'un commit est exactement l'un de `ok`, `not-conventional`, `issue-reference-missing`, `issue-closed`, `issue-not-in-story`, `outside-tdd`, `green-without-red`, `green-without-test`, `test-apart`, `no-component`, `oracle-split`, `oracle-component`, `oracle-without-test`, `code-in-oracle`, `test-in-scenario`, `refactor-in-scenario`, `green-split`, `oracle-touched` ([Commits](./gates.md#commits)).

## Questions à un humain <!-- #human-questions -->

Une question est journalisée quand elle est posée et quand elle reçoit sa réponse. Sans réponse le run attend, et un nouveau démarrage pose la même question avec la même clé.

| Question | Posée quand | Réponses |
| --- | --- | --- |
| `adr-ratification` | un ADR est `Proposed` | `RATIFIED` passe chacun à `Accepted` et commite seul ; `REJECTED` relance DESIGN |
| `scenario-review` | la revue DISTILL a approuvé | `APPROVED` lance DELIVER ; `REVISE` relance DISTILL avec les corrections |
| `environment` | une étape ne peut pas tourner sur cette machine ([ci-dessous](#environment-question)) | `RETRY` ou `ABORT` |
| `blocked` | un agent est bloqué ou refusé deux fois de la même façon, une boucle a atteint son `max_visits`, une lentille a répondu `inconclusive` | une instruction relance le nœud sur une nouvelle passe ; `STOP` termine le run |
| `review-ceiling` | une boucle de revue a atteint son plafond avec des constats moyens et bas seulement | `ACCEPT`, une instruction, ou `STOP` |

### La question `environment` <!-- #environment-question -->

Elle nomme le nœud, la raison, la cause (`environment` : un programme, un service, une permission ou un hook Git que la machine n'a pas ou refuse, ou `config`), le log et le chemin de `run-report.md`. Elle ne renvoie rien à un agent et n'use aucune tentative ; `RETRY` relance l'étape là où elle s'est arrêtée.

## ADR non publiés <!-- #unpublished-adrs -->

Un ADR est publié quand la base du run contient le fichier. Après chaque tentative, un ADR non publié qu'elle a modifié doit être `Proposed`, ne porter ni `amended_by`, ni `amended_in_place`, ni `superseded_by`, aucune section d'historique, aucune version ni épinglage, aucun fichier de code, aucun identifiant de critère d'acceptation ou de ticket et aucun autre ADR, avoir un `decision` d'une phrase, et ne pas remplacer ni amender un autre ADR non publié. Un ADR publié ne change que ses lignes de statut et de remplacement, selon son cycle de vie. Une infraction fait échouer la tentative avec `adr-lifecycle` et une ligne par infraction.

## Document de recherche <!-- #research-document -->

`research/<date>/<slug>-research.md`, écrit depuis le modèle du plugin avant la tentative. Il est rempli quand il existe, diffère du modèle et ne contient plus de `{{…}}`. Non rempli : la tentative suivante, jusqu'à `max_attempts` (3), puis la question `blocked`.

## Preuves qualité <!-- #gate-evidence -->

Le moteur ne lance aucun gate et ne refuse aucune tentative pour l'un d'eux. L'ingénieur logiciel lance chaque gate par [`skraft_repl`](./repl.md), qui écrit une trace signée `logs/runs/<step>-<visit>-<attempt>/runs.jsonl` et un log par run. Le moteur journalise `evidence.checked` (les runs de la tentative dont la trace se lit jusqu'à ses signatures, jamais leur sortie ; sinon aucun, avec le code de ce qui a cassé la trace) et remet la trace, ou ce code, à la revue DELIVER ; sa lentille `quality-gates` la juge ([Gates](./gates.md)). Le tableau de la pull request, le commentaire d'issue et `qa-report.md` lisent les runs journalisés.

## Logs <!-- #logs -->

Ce qu'une commande a affiché va dans un fichier de `logs/` ; le journal, un résultat et une question nomment le fichier sans jamais copier son contenu. `logs/commit-<node>.log` garde ce que Git a affiché quand il a refusé un commit du moteur. Les agents envoient la sortie de leurs commandes dans `<run>/logs/` et leurs fichiers temporaires dans `<run>/.tmp/`.

## Rapport du run <!-- #run-report -->

Le moteur réécrit `run-report.md` depuis le journal après chaque étape : la ligne de statut, le tableau des étapes (visites, tentatives, reprises, durée, coût, résultat), puis, chacune seulement si elle a des lignes, `## Waiting on`, `## Commits`, `## Refusals`, `## Incidents`, `## Agents`, `## Human answers`, `## Accepted findings`, `## Forge writes` et `## Pre-checks`. [`skraft report`](./cli.md) l'affiche.

## Statuts et codes <!-- #statuses-and-codes -->

Les commandes, le mod et le workflow rendent un **statut** (`refused` : rien n'a été fait ; `blocked` : le run ne peut pas avancer ; `waiting` : une réponse humaine est nécessaire ; `done`) et, quand ils s'arrêtent, un **code**.

| Statut | Code | Quand |
| --- | --- | --- |
| `refused` | `invalid-slug`, `invalid-base`, `invalid-args` | le slug n'est pas en kebab-case, `--base` n'est pas une réf Git, des arguments inconnus |
| `refused` | `config-invalid`, `configuration-incomplete`, `bdd-unbound` | `skraft-config.json` est invalide, un consentement n'a pas de réponse, un runner `bdd` lit un dossier qui n'existe pas |
| `refused` | `forge-unreachable`, `base-unresolved`, `source-control-unavailable` | la forge, la base de fusion ou Git est injoignable |
| `refused` | `no-active-pipeline`, `slug-mismatch`, `not-initialised` | pas de `.active-slug` valide, un autre slug demandé, pas de journal |
| `refused` | `pipeline-locked`, `lock-unavailable`, `journal-unverifiable` | une autre session conduit le run, `.lock` ne s'écrit pas, la signature ne peut pas être vérifiée |
| `blocked` | `lock-lost`, `journal-tampered`, `journal-changed` | le bail a été repris, la chaîne est rompue, un autre run a écrit entre-temps |
| `blocked` | `missing-outputs`, `invalid-result`, `design-records`, `research-records` | sorties manquantes, résultat illisible, enregistrements DESIGN ou de recherche en échec, et un humain a répondu `STOP` |
| `blocked` | `scenarios` | le tableau `## Scenarios` du plan de test est illisible ([règles](./phases.md#scenarios)) |
| `blocked` | `write-scope`, `uncommitted`, `adr-lifecycle`, `pull-request-prose` | la tentative a écrit hors de son périmètre, laissé des fichiers non commités, enfreint les règles des ADR, ou la prose est refusée |
| `blocked` | `commit-convention`, `tdd` | un verdict de commit ci-dessus n'est pas `ok` |
| `blocked` | `agent-blocked`, `agent-unavailable`, `agent-failed`, `interrupted` | l'agent a répondu `blocked`, ne démarre pas, s'est arrêté, ou une personne a fait Ctrl-C |
| `blocked` | `review-rejected`, `lens-inconclusive`, `loop-ceiling` | la revue n'a pas d'arête `NEEDS_REWORK`, une lentille a été non concluante, une arête a dépassé son `max_visits` |
| `blocked` | `node-retired`, `workflow-changed`, `workflow-invalid`, `environment` | un nœud que le moteur a retiré, un workflow modifié, un workflow invalide, un humain a répondu `ABORT` |
| `waiting` | le type de la question | une question n'a pas de réponse : `skraft decide <key> <réponse>` |
| `done` | — | la dernière phase est close |

Un agent refusé de la même façon sur deux tentatives de suite, ou sur sa dernière tentative, pose la question `blocked` ; après `STOP` le run garde le code du dernier refus.

`skraft status` ajoute `idle` (aucun pipeline actif), `tampered` (la chaîne est rompue), `running` et `waiting` ; un `step.started` écrit après un `run.finished` rouvre le run.

## Voir aussi <!-- #see-also -->

[Phases](./phases.md), [Hôtes](./hosts.md), [Reprendre ou débloquer un run](../how-to/resume-a-run.mdx), [Lancer les gates](../how-to/run-gates.md), [La ligne de commande skraft](./cli.md), [skraft-config.json](./skraft-config.md), [Le journal d'événements](../explanation/event-journal.md), [glossaire](./glossary.md).
