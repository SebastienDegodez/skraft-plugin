---
title: "Dossier de suivi et journal"
description: "Dossier de suivi, artefacts par phase, sorties sous docs/, pipeline actif, journal chaîné et signé events.jsonl et ses événements, questions, statuts et codes."
persona: software-engineer
---

# Dossier de suivi et journal

Tout ce que sait un run tient dans un dossier du dépôt et un journal chaîné, d'où le moteur recalcule l'état à chaque lecture sans rien stocker d'autre.

Pourquoi un journal d'événements plutôt qu'un fichier d'état, et ce que la reprise y gagne :
[Le journal d'événements](../explanation/event-journal.md).

## Arborescence <!-- #layout -->

Le dossier de suivi vit **dans la copie de travail qui lance le run** :

```
.copilot-tracking/skraft-plans/
├── .active-slug                                   pipeline actif de la copie de travail
└── <slug>/
    ├── .lock                                      bail de la session qui conduit le run
    ├── events.jsonl                               journal chaîné et signé
    ├── run-report.md, qa-report.md, WORKFLOW.md   rapports recalculés après chaque étape
    ├── pull-request.md, issue-progress.md         description de la pull request, commentaire de l'issue
    ├── plans/<AAAA-MM-JJ>/                         issue de la story, stories DISCUSS
    ├── research/<AAAA-MM-JJ>/<slug>-research.md   document de recherche
    ├── details/<AAAA-MM-JJ>/                       documents de DESIGN, DISTILL, PUBLISH
    ├── changes/<AAAA-MM-JJ>/change-log.md         journal des changements de DELIVER
    ├── proposals/<nœud>-<visite>-g<n>.md           proposition pour les mutants survivants d'un fichier
    ├── results/
    │   ├── <nœud>-<visite>-<tentative>.json       résultat qu'un agent écrit pour une tentative
    │   ├── <nœud>-<visite>-<tentative>.documents.json   le dossier de suivi tel que cette tentative l'a trouvé
    │   └── loop/                                  briefs, réponses et pending.json de la boucle next / record
    ├── reviews/<nœud>-<visite>/                   ce que lisent les lentilles d'une passe de revue
    │   ├── changes.patch                          changements depuis la base du run
    │   ├── changed-files.txt                      chemins que ces changements touchent
    │   ├── code.patch, code-files.txt             les mêmes pour une lentille aveugle, sans docs/adr ni la documentation durable
    │   ├── design.patch, design-files.txt         les mêmes pour `fitness` : les documents de conception seulement (écrits quand la revue a cette lentille)
    │   ├── features.patch, features-files.txt     les mêmes pour `business-alignment` : tout dossier `docs/features/` seulement (écrits quand la revue a cette lentille)
    │   ├── context.md                             story, règles du projet, qui a écrit quel document
    │   ├── components.json                        stack, stratégie de mocking, contract testing
    │   └── verdict.yaml                           le verdict de la passe, écrit par le moteur
    ├── gates/<composant>/<gate>-<n>.log           preuve de chaque gate lancée
    └── visuals/<composant>/e2e-<n>.log            sortie de chaque commande e2e de la publication des captures
```

`results/` et `reviews/` appartiennent au moteur : ce ne sont pas des documents du run, et une
revue ne les donne jamais à une lentille comme tels.

`verdict.yaml` est écrit à la fin de chaque passe de revue, chaque texte entre guillemets doubles :

```yaml
status: "NEEDS_REWORK"          # APPROVED | NEEDS_REWORK | BLOCKED
code: null                      # lens-inconclusive quand BLOCKED
summary: "NEEDS_REWORK: 1 reason to address"
findings:                       # les findings blocker, high et medium retenus
  - lens: "consistency"
    id: "F2"
    gate: "G1"
    severity: "high"
    location: "docs/adr/adr-001-card-payment.md:3"
    description: "two contexts own payments"
    suggestion: null
notes: []                       # les findings low, mêmes clés
refutations:                    # chaque vérification de cette passe
  - lens: "consistency"
    finding: "F1"
    verdict: "refuted"          # confirmed | refuted | unverifiable
    reason: "docs/adr/adr-001-card-payment.md:3 names Acme Pay"
    dissent: true               # seulement quand la lentille était seule (Dissent Rule)
reused:                         # les lentilles reprises de la passe précédente
  - lens: "fitness"
```

Le **slug** est le nom kebab-case d'un pipeline (`checkout-by-card`). Un slug = un pipeline =
un dossier.

## Artefacts par phase <!-- #artifacts -->

Les documents d'une phase vont dans un sous-dossier daté `AAAA-MM-JJ`, ou sous `docs/` du dépôt
pour la [documentation durable](#durable-docs) ; le moteur donne à l'agent le chemin de chaque
sortie attendue, et la pré-crée quand elle a un gabarit. Détail par
phase : [Phases](./phases.md).

| Phase | Artefact | Chemin |
| --- | --- | --- |
| DISCOVER (skraft-backlog) | rapport de triage, proposition de sprint | `research/{date}/triage-{date}.md`, `research/{date}/sprint-proposal.md` |
| DISCUSS (skraft-backlog) | stories, brouillons de critères d'acceptation | `plans/{date}/stories-{milestone}.md`, `plans/{date}/ac-draft-{story}.md` |
| RESEARCH | document de recherche | `research/{date}/{slug}-research.md` |
| DESIGN | matrice de cohérence, contrats, plan de supersession | `details/{date}/consistency-matrix-{slug}.md`, `contracts-{story}.md`, `supersession-plan-{story}.md` ; `details/{date}/structural-scan.json` (écrit par le moteur) |
| DESIGN | context map, conception tactique, modèle d'événements (dans le dépôt, hors du dossier de suivi) | `docs/architecture/context-map.md`, `docs/architecture/{bounded-context}.md`, `docs/domain/event-model/{bounded-context}.md` |
| DESIGN | ADR (dans le dépôt, hors du dossier de suivi) | `docs/adr/adr-{nnn}-{sujet}.md`, `docs/adr/decisions-index.md`, `docs/adr/supersessions.md` |
| DISTILL | plan de test, plan d'implémentation | `details/{date}/test-plan-{slug}.md`, `details/{date}/impl-plan-{story}.md` |
| DISTILL | scénarios Gherkin, non exécutables (dans le dépôt, hors du dossier de suivi) | `docs/features/{bounded-context}/{feature}.feature` |
| DELIVER | journal des changements | `changes/{date}/change-log.md` |
| DELIVER | propositions pour les mutants survivants | `proposals/kill_proposal-{visite}-g{n}.md` |
| DELIVER | preuve de chaque gate ; sortie des commandes e2e | `gates/{composant}/{gate}-{n}.log` ; `visuals/{composant}/e2e-{n}.log` |
| PUBLISH | prose et description de la pull request | `details/{date}/pull-request-prose-{slug}.md`, `pull-request.md` |
| revues DESIGN, DISTILL, DELIVER | entrées des lentilles et verdict écrit par le moteur | `reviews/{nœud}-{visite}/` |
| tout le run | journal, rapports recalculés après chaque étape | `events.jsonl`, `run-report.md`, `qa-report.md`, `WORKFLOW.md`, `issue-progress.md` |

Les lentilles n'écrivent aucun fichier : elles rendent des findings, et le moteur écrit
`reviews/{nœud}-{visite}/verdict.yaml`.

## Documentation durable <!-- #durable-docs -->

Certains documents d'un run sont la documentation du dépôt, pas celle du run. La phase qui les
produit les écrit sous `docs/` dans la copie de travail, sur la branche de la story : la pull
request les montre, et les runs suivants les relisent.

| Document | Phase | Chemin dans le dépôt |
| --- | --- | --- |
| context map : bounded contexts, classe de sous-domaine, relations entre contextes | DESIGN | `docs/architecture/context-map.md`, un seul fichier complété story après story |
| conception tactique : agrégats, entités, objets valeur, événements de domaine, repositories | DESIGN | `docs/architecture/{bounded-context}.md` |
| modèle d'événements : commandes, requêtes, événements de domaine, modèles de lecture, tranches | DESIGN | `docs/domain/event-model/{bounded-context}.md` |
| ADR, index des décisions, registre des supersessions | DESIGN | `docs/adr/` |
| scénarios Gherkin, non exécutables | DISTILL | `docs/features/{bounded-context}/{feature}.feature` |

Restent dans le dossier de suivi : le document de recherche, `contracts-{story}.md`,
`supersession-plan-{story}.md`, `consistency-matrix-{slug}.md`, `test-plan-{slug}.md`,
`impl-plan-{story}.md`, le journal des changements, les propositions sur les mutants, la prose de
la pull request, le journal et ses rapports.

| Règle | Détail |
| --- | --- |
| Lecture | consigne aux agents : RESEARCH et DESIGN lisent `docs/` avant toute autre chose ; le moteur ne le contrôle pas |
| Déjà couvert | quand `docs/` couvre déjà la story, la phase le dit dans sa sortie déclarée (le document de recherche, la matrice de cohérence), cite les fichiers de `docs/` et passe à la suite. Le moteur ne contrôle que la matrice : sa ligne `docs-relied-on:` doit lister au moins un fichier de `docs/adr`, `docs/architecture`, `docs/domain/event-model` ou `docs/features`, et chaque fichier listé doit exister dans la copie de travail ; il ne cherche pas de citation dans le document de recherche |
| Mise à jour | consigne aux agents : une phase complète un fichier existant de `docs/` et ne le réécrit pas ; le moteur ne le contrôle pas |
| ADR | un ADR publié n'est jamais édité ; un nouvel ADR peut le remplacer ([Ce qui n'est jamais réécrit](#append-only)) |
| Écriture permise | DESIGN : `docs/adr/`, `docs/architecture/`, `docs/domain/event-model/` ; DISTILL : `docs/features/` ([Phases](./phases.md)) |
| Lentille aveugle | `cold-reader` ne lit ni ces fichiers ni les ADR : ils sont retirés de `code.patch` et de `code-files.txt` |

## Ce qui n'est jamais réécrit <!-- #append-only -->

| Élément | Règle |
| --- | --- |
| `events.jsonl` | on n'y fait qu'ajouter des lignes ; une ligne modifiée casse la chaîne ou la signature, ce que le moteur voit à la lecture suivante |
| état du run | recalculé depuis le journal à chaque lecture ; aucun fichier d'état n'est écrit |
| ADR pas encore sur la branche de base | corrigé sur place, reste `Proposed` ; aucun historique de brouillons ([ADR non publiés](#unpublished-adrs)) |
| ADR publié | seules ses lignes de statut et de remplacement changent, jamais supprimé ; le nouvel ADR porte `**Supersedes:** ADR-MMM` et une ligne est ajoutée à `docs/adr/supersessions.md`, que le moteur vérifie à la fin de chaque tentative de DESIGN |

## `.active-slug` <!-- #active-slug -->

| Règle | Détail |
| --- | --- |
| Contenu | le slug suivi d'un saut de ligne, écrit par `skraft init <slug>` (et par Init dans le mod et le workflow) |
| Lecture | blancs retirés ; un contenu qui n'est pas kebab-case vaut « aucun pipeline actif » |
| Obligatoire | toute commande qui agit sur un run lit ce fichier ; le moteur ne devine jamais un slug |
| Portée | une copie de travail ; un worktree Git a donc le sien |

## `events.jsonl` <!-- #events-jsonl -->

Un objet JSON par ligne, en UTF-8. Les lignes vides sont ignorées ; `\n` et `\r\n` sont
acceptés. Chaque événement porte trois champs communs :

| Champ | Contenu |
| --- | --- |
| `type` | type de l'événement (tableau ci-dessous) |
| `at` | instant ISO-8601 en UTC |
| `prev` | SHA-256 en hexadécimal minuscule de la ligne précédente (ses octets UTF-8, sans le saut de ligne) ; `null` sur la première ligne |

```mermaid
flowchart LR
    L1["ligne 1<br/>run.started<br/>prev: null"] -->|sha256| L2["ligne 2<br/>step.started<br/>prev: h1"]
    L2 -->|sha256| L3["ligne 3<br/>step.recorded<br/>prev: h2"]
    L3 -->|sha256| L4["ligne 4<br/>phase.closed<br/>prev: h3"]
    L4 -->|sha256| L5["ligne 5<br/>run.finished<br/>prev: h4"]
```

**Contrôle de la chaîne.** À chaque ouverture, le moteur vérifie toutes les lignes. La
première rupture donne `journal-tampered` avec ce message :
`journal tampered: events.jsonl line N <détail>; restore the file or start a new slug`.

| `<détail>` | Cause |
| --- | --- |
| `is not JSON` | la ligne n'est pas un objet JSON |
| `does not open the chain` | la ligne 1 a un `prev` non nul |
| `does not chain to line N-1` | `prev` n'est pas l'empreinte de la ligne précédente |


**Signature.** Chaque ligne finit par un champ `"sig"` : le HMAC de la ligne sans ce champ, sous
la clé du run. La première ligne nomme cette clé par `keyId` ; la clé est gardée dans
`~/.skraft/journal-keys/<keyId>.key` de la machine qui a démarré le run. Une ligne
`journal.adopted`, écrite par `skraft journal adopt`, nomme une nouvelle clé sous laquelle les
lignes suivantes sont signées ; les lignes d'avant restent non vérifiées.

| `<détail>` (suite) | Cause |
| --- | --- |
| `names no signing key` | la première ligne ne nomme aucune clé |
| `is not signed` | la ligne ne porte pas de `sig` |
| `does not carry the signature of the run's key` | `sig` n'est pas le HMAC de la ligne sous la clé du run |
| `is an adoption that does not follow the lines before it` | une ligne `journal.adopted` qui ne suit pas les lignes d'avant |

Sans la clé sur cette machine, ou pour un journal écrit avant la signature : code
`journal-unverifiable` (`journal unverifiable: the key that signed events.jsonl is not in
~/.skraft/journal-keys on this machine …`) ; `skraft journal adopt` l'adopte. Sans dossier
personnel (`HOME`, `USERPROFILE`) : `journal-unverifiable`, `journal unverifiable: the
environment names no home folder …`.

**Écritures concurrentes.** Avant chaque ajout, le moteur relit le journal. Si une autre
écriture est arrivée depuis l'ouverture, il s'arrête avec `journal-changed` :
`<slug>: another run wrote events.jsonl meanwhile; run again once it stops`.

## Événements <!-- #events -->

| `type` | Écrit par | Champs |
| --- | --- | --- |
| `run.started` | Init, au premier init du slug | `slug` ; `story` (`{ issue, title }` ou `null`) ; `workflow` (`skraft`) ; `base` (liste, voir ci-dessous) |
| `step.started` | le pipeline, avant de lancer un agent | `step` (`research`) ; `phase` (`RESEARCH`) ; `agent` (`solution-researcher`) ; `attempt` (1, 2…) ; `outputs` (chemins attendus, relatifs au dossier du slug) ; `missing` (chemins manquants à la tentative précédente, vide à la première) ; `assignment` : ce sur quoi l'agent tourne — `family`, `tier`, `source` (`agent`, `workflow`, `type`, `default`, `escalation`, `host`) et, par hôte, `model` (liste ou null), `effort` (ou null) et la `source` de chacun ; une tentative reprise tourne de nouveau dessus, quoi que dise la configuration depuis ; `host` (`claude-code`, `copilot`) : l'hôte qui lance l'agent, dont il prend le `model` et l'`effort` (sans modèle : l'hôte choisit). Le log de `/workflows`, la vue Observe (`agents`) et `run-report.md` (`## Agents`) montrent pour chaque agent sa famille, son palier, son modèle sur cet hôte (ou `model chosen by the host`) et son niveau, puis le modèle sur lequel l'hôte dit l'avoir lancé une fois qu'il a répondu. Sur un nœud question, `question` (le type de question) à la place d'`agent` |
| `step.recorded` | le pipeline, après l'agent | `step` ; `attempt` ; `outcome` (`outputs-complete` ou `missing-outputs` ; sur un nœud question `answered`, ou `skipped` quand aucun humain n'était nécessaire, avec `answer` ; `aborted`, code `environment`, après un `ABORT`) ; `missing` ; `durationMs` ; `cost` (absent quand l'hôte n'en rend pas) ; `model` (le modèle de l'agent, null pour celui de la session ; absent sur une reprise qui ne l'a pas lancé) ; `ceiling` sur une étape d'où aucune arête ne repart : le nœud vers lequel mène l'arête à son `max_visits` (`loop-ceiling`), celui que relance la consigne d'un humain, `null` quand aucune arête ne repart |
| `question.asked` | le pipeline, quand il pose une question à un humain | `key` (`adr-1`, `gates-1`), le nœud qui pose la question puis son rang parmi celles de ce nœud dans le run ; `kind` (`publish-consent`, `adr-ratification`, `reporting-consent`, `mutation-plan`, `environment`, `blocked`) ; `text` ; `options` ; `refusals` ; `header` ; `step` ; `visit` ; `subjects` (les ADR à ratifier, vide sinon) |
| `question.answered` | la boîte de dialogue de l'hôte, ou `skraft decide` | `key` ; `answer` (pour une question `blocked`, la consigne de l'humain telle qu'il l'a écrite, sur une ligne, ou `STOP`) ; `reason` (`null` sans raison) ; `by` (`host`, `decide`, `host-confirmed` ou `cli-tty`) |
| `phase.closed` | le pipeline | `phase` |
| `run.finished` | le pipeline | `status` (`completed` quand la dernière phase est close, `blocked` quand le run s'arrête) ; `code` (avec `blocked`) ; `reason` (`<PHASE> closed` avec `completed`) |
| `run.stopped` | le pipeline, quand l'agent ne démarre pas ou s'arrête, ou qu'une lentille répond deux fois sans verdict lisible | `code` (`agent-unavailable`, `agent-failed` ou `lens-unreadable`) ; `reason`. Jamais écrit quand la machine ne peut pas exécuter une étape : le moteur pose alors la question `environment` |
| `review.lens` | un nœud de revue, une fois par lentille, et une fois par passe pour chaque contrôle du moteur qui trouve quelque chose | `step` ; `visit` ; `lens` (`consistency` ; `test-integrity#patch` pour les findings G9 du moteur, `testability#layout` pour ses findings G11, sans `fingerprint`) ; `agent` (`consistency-lens`) ; `model` (le modèle sur lequel elle a tourné, `claude-haiku-5.5` ; null pour celui de la session) ; `fingerprint` (empreinte des entrées de la lentille) ; `verdict` (`pass`, `fail` ou `inconclusive`) ; `findings` (`{ id, gate, severity, location, description, suggestion }`, `gate` étant l'identifiant de la table de la lentille : `G7`, `M2`…) ; `cost` (absent s'il est inconnu) ; `reused` (`true` quand le résultat est repris de la passe précédente : mêmes entrées, rien trouvé) |
| `review.refuted` | un nœud de revue, une fois par finding blocker, high ou medium vérifié par `finding-refuter` ; les findings de plusieurs lentilles à une même ligne, vérifiés en un appel, en donnent un chacun avec son propre verdict, son `cost` sur le premier | `step` ; `visit` ; `lens` ; `finding` (son id) ; `verdict` (`confirmed`, `refuted` ou `unverifiable`) ; `reason` ; `dissent` (`true` quand la lentille du finding était seule à renvoyer le travail, et que le réfuteur l'a jugé avec toutes les entrées de la revue) ; `model` ; `cost` |
| `review.cost` | un nœud de revue, une fois par lot que l'hôte chiffre d'un bloc (le mod Claude Code) | `step` ; `visit` ; `cost` |
| `gate.ran` | `skraft gate`, une fois par gate | `component` ; `gate` (`build`… ou `none`) ; `scope` (`touched` ou `all`) ; `command` (`null` pour `none`) ; `status` (`pass` ou `fail`) ; `failure` (`environment`, `deterministic` ou `null`) ; `exitCode` (`null` si rien n'a tourné) ; `durationMs` ; `evidence` (chemin relatif au dossier du slug, `null` pour `none`) |
| `commits.checked` | le pipeline, après une tentative d'une étape d'agent qui a fait des commits | `step` ; `visit` ; `attempt` ; `commits`, chacun `{ repository, sha, subject, kind, verdict, replay }` : `kind` (`red`, `green`, `refactor`, `other`, `invalid`), `verdict` (`ok`, `not-conventional`, `issue-reference-missing`, `issue-closed`, `issue-not-in-story`, `green-without-red`, `not-red`, `no-component`), `replay` (`{ component, command, exitCode, durationMs }` du rejeu que le commit rapporte, `null` quand il n'a pas été rejoué) ; `settled` (`false` quand la machine a arrêté la vérification, une question `environment` posée : ses verdicts sont ceux d'avant les rejeux qu'elle n'a pas pu lancer, si bien que ni une tentative suivante ni les rapports ne les tiennent pour définitifs, et la tentative après `RETRY` rejoue de nouveau ses commits rouges). `settled` est absent d'une vérification allée à son terme, et des journaux écrits avant que le champ existe : absent veut dire réglé |
| `tdd.replay-slow` | le pipeline, une fois par phase, avec `tdd.replay` à `all` | `phase` ; `replayMs` ; `phaseMs` |
| `visuals.recorded` | le nœud `playwright-visuals` | `step` ; `visit` ; les captures de chaque front end |
| `publish.requested` | `skraft publish` | `by` (`skraft publish`) ; `consent` (`publish.pullRequest` au moment de la commande) |
| `pull-request.opened` | le nœud `publish` ou `skraft publish` | `number` ; `url` ; `base` ; `head` ; `draft` ; `bodyHash` |
| `pull-request.updated` | le nœud `publish` ou `skraft publish` | `number` ; `url` ; `bodyHash` |
| `pull-request.details-kept` | le nœud `publish` ou `skraft publish`, une fois la pull request ouverte, mise à jour ou à jour | `number` ; `part` ; `parts` ; `url` du commentaire ; `bodyHash` de la partie ; `via` et `fallback` quand un serveur MCP était proposé |
| `pull-request.details-skipped` | idem, quand une partie n'a pas pu être gardée | `number` ; `part` ; `parts` ; `reason` ; `via` et `fallback` |
| `issue.commented`, `issue.comment-skipped` | le run, à chaque transition qu'il rapporte sur l'issue de la story | `issue` ; `kind` ; `phase` ; `step` ; `event` ; `url` (commenté) ou `reason` (sauté) ; `via` (`mcp`, `gh` ou `az`) et `fallback` quand un serveur MCP de l'hôte était offert |
| `journal.adopted` | `skraft journal adopt` | `keyId` (la nouvelle clé) ; `previousKeyId` ; `unverified` (nombre de lignes d'avant non vérifiées) |

Chaque entrée de `run.started.base` : `{ component, root, repository, ref, source, sha }`.
`component` vaut `null` pour la copie de travail ; `ref` est la ref réellement utilisée
(`main` ou `origin/main`) ; `source` vaut `flag`, `component`, `config` ou `default`. Règle de
calcul : [skraft-config.json](./skraft-config.md).

Le coût vient de l'hôte : le mod Claude Code journalise l'écart de coût de la session en
USD ; le workflow Copilot n'en rend pas (Copilot compte en crédits, pas en USD). Cet écart
comprend tout ce qui s'est échangé dans la session pendant que l'agent tournait : le panneau et
le rapport l'affichent donc comme approximatif (`~$0.42`), avec une note.

Le `step.started` d'un nœud de revue porte `lenses` au lieu d'`agent`, `assignments` (l'affectation de chaque agent lentille) et `refuter` (celle du réfutateur, par palier d'escalade : `standard`, `frontier`), que rejoue une revue reprise, et `host` ; chaque `review.lens` et `review.refuted` porte l'`assignment` sur laquelle il a tourné ; son `step.recorded` a
un `outcome` `approved`, `needs-rework` ou `blocked` (`code` `lens-inconclusive` quand une
lentille a répondu `inconclusive` ou a échoué sans finding blocker, high ou medium : le run pose
la question `blocked` sur le nœud de revue ; `reason` nomme chacune
de ces lentilles et ce qu'elle a noté), `failures` (les findings retenus, que le brief suivant
de l'agent de la phase liste) et `cost` (ses lentilles, ses vérifications et ses lots de cette passe, reprise comprise). Une étape où le run a été renvoyé, par les gates, une revue ou le refus d'un humain, porte
`sentBy` (`gate`, `review` ou `ask`) sur son `step.started` ; une étape que rien n'a renvoyée n'en a pas.
La consigne d'un humain à une question `blocked` ouvre le passage suivant du nœud avec `sentBy`
`ask` et la consigne pour `feedback` ; le `step.started` d'un nœud de revue porte aussi
`feedback`, que lit chaque lentille de ce passage quand `sentBy` vaut `ask`.
Le `step.recorded` d'un agent liste dans `documents` les fichiers du dossier de suivi que sa
tentative a créés ou modifiés (hors fichiers du moteur), et pour le solution architect le
`details/<date>/structural-scan.json` que le moteur a écrit avant la tentative ; une revue donne ces documents à chaque
lentille, par phase, et écrit `reviews/<nœud>-<visite>/context.md` : la story, les fichiers de
règles du projet trouvés (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`,
`.github/copilot-instructions.md`, `docs/adr/decisions-index.md`) et quel agent a écrit quel document.

## Questions à un humain <!-- #human-questions -->

Une question est posée une fois et journalisée (`question.asked`) ; sa réponse est
journalisée (`question.answered`), puis appliquée. Sans réponse, le run **attend** (fail
closed) : rien de plus n'est journalisé, et relancer le run repose la même question, avec la
même clé, sans relancer d'agent. Un run interrompu à n'importe quel point de décision reprend
de la même façon.

| Question | Clé | Posée quand | Réponse appliquée |
| --- | --- | --- | --- |
| `adr-ratification` | `<nœud>-<n>` (`adr-1`) | un ADR `docs/adr/adr-NNN-*.md` est `Proposed` ; aucun : `step.recorded` `skipped`, raison `no Proposed ADR to ratify` | `RATIFIED` : chaque ADR passe en `Accepted` (`status: Accepted`, `ratified_by: "human AAAA-MM-JJ"`, la ligne `**Status:**`, sa ligne dans `docs/adr/decisions-index.md` s'il existe), commités seuls en `docs(adr): ratify ADR-001, ADR-002`. `REJECTED` : DESIGN repasse avec la raison |
| `publish-consent` | `<nœud>-<n>` | `publish.pullRequest` n'est pas réglé dans `skraft-config.json`, ou l'a été pour une version antérieure de la question ; sinon : `step.recorded` `skipped`, la réponse réglée, rien n'est écrit | la réponse écrite en `"publish": { "pullRequest": true\|false }` avec sa `questionVersions` |
| `reporting-consent` | `<nœud>-<n>` | `publish.visuals` n'est pas réglé dans `skraft-config.json` et un composant est un frontend (stack `react`, ou `commands.e2e`) ; sinon : `step.recorded` `skipped`, réponse `DECLINED`, rien n'est écrit | la réponse écrite en `"publish": { "visuals": true\|false }`, et gardée pour la suite du run : une boucle qui repasse par le nœud ne la redemande pas |
| `mutation-plan` | `<nœud>-<n>` (`mutation_plan-1`) | la gate de mutation a échoué et `kill_proposal` a écrit ses propositions | `APPLY` : `kill_mutants` applique les propositions ; une consigne : `kill_mutants` la reçoit avec les propositions dont elle s'écarte ; `STOP` : `run.finished` `blocked`, code `stopped` |
| `environment` | `<nœud>-<n>`, le nœud qui ne peut pas tourner (`gates-1`) | une étape ne peut pas tourner sur cette machine | `RETRY` : la même étape est revérifiée ou relancée, son agent seulement si ses sorties manquaient encore ; `ABORT` : run bloqué |
| `blocked` | `<nœud>-<n>`, le nœud qu'une consigne relance (`design-1`) | un agent a répondu `blocked` (le nœud de l'agent), une boucle a atteint son `max_visits` (le nœud vers lequel revient l'arête plafonnée), une lentille a répondu `inconclusive` (le nœud de revue) | une consigne : le même run entre dans ce nœud sur un nouveau passage, la consigne pour `feedback` (`sentBy` `ask`), et aucune arête vers ce nœud ne compte plus comme empruntée ; `STOP` : `run.finished` `blocked` avec le code et la raison du blocage, rien d'autre |

La question `environment` se lit `<node> cannot run on this machine: <reason>. Fix it, then
RETRY; or ABORT the run.` Elle est posée quand un programme de gate est introuvable, qu'un
commit rouge ne peut pas être rejoué, qu'un composant n'a pas de commande de test, que Git
échoue, que `docs/adr` existe mais ne peut pas être listé (`docs/adr cannot be listed: Git or the file system refused to read it`, texte fixe qui ne
reprend jamais celui de l'erreur ; la ratification n'est alors jamais sautée) ou que Git refuse le commit de ratification. L'étape
reste ouverte. Le même échec après un `RETRY` pose une nouvelle question (`gates-2`). Après un
`RETRY` donné dans une boîte de dialogue de l'hôte, le moteur relit `skraft-config.json` ; s'il
est invalide, le run s'arrête avec `config-invalid` avant de lancer quoi que ce soit, sans rien
journaliser : une fois le fichier corrigé, relancer le run reprend l'étape ouverte.

## ADR non publiés <!-- #unpublished-adrs -->

Un ADR est **publié** quand la base du run contient le fichier. Après chaque tentative
d'agent, chaque ADR modifié par la tentative et non publié doit :

- avoir le statut `Proposed` (seul le moteur pose `Accepted` ; modifier un ADR ratifié dans ce
  run, c'est le remettre en `Proposed`, et sa ratification est redemandée) ;
- ne porter aucun champ d'en-tête `amended_by`, `amended_in_place` ou `superseded_by` ;
- n'avoir aucune section d'historique (`## Historique`, `## History`, `## Erratum`, `## Amendments`, `## Changelog`, `## Revisions`, à toute profondeur de titre) ;
- ne nommer aucune version, tag d'image, digest ni version de paquet dans le corps (`3.1.4`, `v3`, `node:20-alpine`, `react-router@6`) : nommer la technologie ou la capacité qu'elle apporte ;
- porter un en-tête `decision` d'une seule phrase ;
- ne pas `supersedes` ni `amends` un autre ADR non publié, que le lien soit dans l'en-tête ou
  sur une ligne `**Supersedes:** ADR-MMM` : modifier celui-ci sur place.

Tout ADR modifié par la tentative, publié ou non, porte un statut du jeu fermé : `Proposed`, `Accepted`, `Rejected`, `Deprecated`, `Superseded` ou `Superseded by ADR-NNN`, entier et en anglais, dans son en-tête et sa ligne `**Status:**` (`Superseded (partial)` est refusé : un remplacement partiel est un nouvel ADR qui amende l'ancien).

**ADR publiés.** Un ADR de la base ne change que ses lignes `status`, `superseded_by` et `**Status:**`, comparées au texte de la base ; tout autre changement, ou sa suppression, est refusé. Un ADR publié se remplace ou s'amende toujours de la manière habituelle. Un manquement
refuse la tentative avec le code d'échec `adr-lifecycle` et une ligne par manquement, par
exemple `docs/adr/adr-002-x.md supersedes ADR-001, which is not on the default branch yet:
edit docs/adr/adr-001-y.md in place instead`. L'agent recommence avec ces lignes.

## Document de recherche <!-- #research-document -->

| Règle | Détail |
| --- | --- |
| Chemin | `<slug>/research/<AAAA-MM-JJ>/<slug>-research.md` ; la date est le jour UTC de la première tentative, réutilisée par la relance |
| Pré-création | avant la tentative, le moteur l'écrit depuis le template `research.template.md` du plugin s'il n'existe pas |
| Rempli | le fichier existe, n'est pas vide, diffère du template et ne contient plus aucun `{{…}}` |
| Relance | non rempli : tentative suivante, avec la liste des chemins manquants, jusqu'à `max_attempts` (3 par défaut) |
| Arrêt | non rempli après la dernière tentative : `run.finished` `blocked`, code `missing-outputs` |
| Reprise | une tentative ouverte dont les sorties sont déjà remplies est enregistrée sans relancer l'agent |

## Preuves des gates <!-- #gate-evidence -->

Chaque gate lancée écrit `<slug>/gates/<composant>/<gate>-<n>.log`, où `<n>` vaut 1 plus le
nombre de `gate.ran` déjà journalisés pour ce composant et cette gate. Format :

```
$ <commande lancée>
cwd: <racine du composant>
result: pass: exited 0
--- stdout
<sortie standard>
--- stderr
<sortie d'erreur>
```

La première ligne montre la commande telle qu'elle a démarré : `{baseSha}` remplacé, interpréteur
Python choisi, citée pour se relire en la même liste d'arguments. Le champ `command` de
`gate.ran` garde la ligne écrite dans `skraft-config.json`.

En échec, la ligne `result` vaut `fail (<classe>): <raison>`. Les sections `stdout` et
`stderr` manquent quand rien n'a été lancé (ligne refusée). Un composant sans
commande de gate n'écrit pas de preuve.

## Statuts et codes <!-- #statuses-and-codes -->

Les commandes, le mod et le workflow rendent un **statut** et, en cas d'arrêt, un **code** :
`refused` (rien n'a été fait), `blocked` (le run ne peut pas avancer), `waiting` (le run
attend la réponse d'un humain), `done`.

| Statut | Code | Quand | Message type | Action |
| --- | --- | --- | --- | --- |
| `refused` | `invalid-slug` | slug pas en kebab-case | `slug must be kebab-case, got "<slug>"` | choisir un slug kebab-case |
| `refused` | `invalid-base` | `--base` n'est pas une ref git | `--base must be a git ref: text with no blank that does not start with -` (la valeur n'est jamais reprise) | passer une ref sans blanc ni `-` initial |
| `refused` | `config-invalid` | `skraft-config.json` invalide | `skraft-config.json is invalid: <toutes les erreurs>` | corriger chaque erreur listée |
| `refused` | `base-unresolved` | pas de merge-base avec la ref dans un dépôt | `… has no merge base with <ref>; set baseBranch in skraft-config.json or pass --base <ref>` | régler `baseBranch` ou passer `--base` |
| `refused` | `source-control-unavailable` | Git ne se lance pas alors que la config liste des composants | `<erreur>; the components of skraft-config.json need Git for their base` | installer Git, le mettre dans le PATH |
| `refused` | `no-active-pipeline` | pas de `.active-slug` valide | `no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug` | `skraft init <slug>` ou `/skraft <slug>` |
| `refused` | `slug-mismatch` | l'appel nomme un autre slug que le pipeline actif | `the active pipeline of this working copy is <actif>, not <demandé>; switch with an explicit init` | init explicite du slug voulu |
| `refused` | `not-initialised` | le slug actif n'a pas de journal | `<slug> has no journal (events.jsonl); start it with an explicit init` | init explicite du slug |
| `refused` | `pipeline-locked` | une autre session conduit le pipeline (`.lock` renouvelé depuis moins de 2 min) | `<slug> is driven by another session (started …, last seen …); let it finish or stop it, or run again after … if that session is gone` | attendre la fin de l'autre session, ou son expiration |
| `refused` | `lock-unavailable` | la session ne peut pas écrire `.lock` | `<slug>: this session cannot write the pipeline's lock file (.copilot-tracking/skraft-plans/<slug>/.lock); …` | rendre le dossier de suivi inscriptible |
| `refused` | `journal-unverifiable` | cette machine ne peut pas vérifier la signature du journal | `journal unverifiable: …` | restaurer la clé, ou `skraft journal adopt` |
| `blocked` | `lock-lost` | la session a perdu le bail en cours de run | `<slug>: this session no longer holds the pipeline's lease …; this run stops here and writes nothing more` | relancer quand l'autre session a fini |
| `refused` | `no-components` | `skraft gate` sans composant | `skraft-config.json lists no component; run skraft init to detect them` | `skraft init` |
| `blocked` | `journal-tampered` | chaîne cassée | `journal tampered: events.jsonl line N …; restore the file or start a new slug` | restaurer le fichier ou démarrer un nouveau slug |
| `blocked` | `journal-changed` | un autre run écrit pendant celui-ci | `<slug>: another run wrote events.jsonl meanwhile; run again once it stops` | attendre la fin de l'autre run, relancer |
| `blocked` | `missing-outputs` | sorties absentes après la dernière tentative | `solution-researcher left required outputs missing after 3 attempts: <chemins>` | une reprise rend le même blocage ; corriger la cause et démarrer un nouveau slug |
| `blocked` | `design-records` | les traces DESIGN de l'architecte échouent encore après sa dernière tentative : une matrice de cohérence dont `consistency-gate` ne vaut pas `PASS` (G10 ; une matrice absente arrête sur `missing-outputs`), un ADR nommé `*-rejected.md`, `*-accepted.md`, `*-deprecated.md` ou `*-superseded.md` (G14), une ligne `**Supersedes:**` sans sa ligne dans `docs/adr/supersessions.md` (G2, G12), un ADR sans sa ligne dans `docs/adr/decisions-index.md` | `solution-architect still failed after 3 attempts: <chaque trace en faute>` | écrire la trace, puis démarrer un nouveau slug |
| `blocked` | `agent-blocked` | l'agent a répondu `blocked`, et un humain a répondu `STOP` à la question `blocked` | `<agent> is blocked: <résumé>` | définitif : une nouvelle exécution du slug reste bloquée |
| `blocked` | `agent-unavailable` | l'hôte ne peut pas lancer l'agent | Claude Code : `skraft:solution-researcher could not be started: …` ; Copilot : `agent "solution-researcher" is not available in this Copilot session (agents: …); install or enable the skraft plugin, or pass agentIds` | installer ou activer le plugin, puis reprendre ; la tentative n'est pas consommée |
| `blocked` | `agent-failed` | l'agent s'arrête sans finir et ses sorties manquent | `<agent> stopped without finishing: <erreur>` | reprendre : l'étape reste ouverte et la même tentative est relancée |
| `blocked` | `review-rejected` | une revue répond `NEEDS_REWORK` et son nœud n'a pas d'arête `NEEDS_REWORK` | `<nœud> asked for rework and the workflow has no NEEDS_REWORK edge out of it; <findings>` | corriger les findings dans un nouveau slug, ou ajouter l'arête au workflow |
| `blocked` | `lens-inconclusive` | une lentille a répondu `inconclusive` (une lentille qui répond `fail` avec seulement des findings low passe, ses findings notés) | `<lentille>: inconclusive: <notes>`, une par lentille, séparées par `; ` | posée d'abord comme question `blocked` ; après `STOP`, définitif : un nouveau lancement du slug reste bloqué |
| `blocked` | `lens-unreadable` | une lentille a répondu deux fois sans verdict lisible (`run.stopped`) | `<lentille>-lens answered 2 times without a readable verdict: <erreur>` | reprendre : les lentilles déjà journalisées dans cette passe sont gardées, les illisibles sont relancées |
| `blocked` | `loop-ceiling` | un refus ou un échec ferait passer une arête au-delà de son `max_visits`, et un humain a répondu `STOP` à la question `blocked` | `<from> -> <to> was already taken N times, its max_visits` | définitif : un nouveau lancement du slug reste bloqué |
| `blocked` | `stopped` | un humain a répondu `STOP` à la question `mutation-plan` | `a human stopped the run at <nœud>; the proposals are in <chemins>` | définitif |
| `blocked` | `environment` | un humain a répondu `ABORT` | `aborted by a human: <question>` | corriger la machine, démarrer un nouveau slug |
| `waiting` | `publish-consent`, `adr-ratification`, `reporting-consent`, `mutation-plan`, `environment` | une question est sans réponse | `<question> Answer with skraft decide <clé> <A>\|<B>`, plus ` (a refusal with its reason)` quand la question a un refus | répondre par `skraft decide`, `/skraft decide` ou `skraft_decide` |
| `waiting` | `blocked` | un agent a répondu `blocked`, une boucle a atteint son `max_visits` ou une lentille a répondu `inconclusive`, et personne n'a encore répondu à la question `blocked` | `<question> Answer with skraft decide <clé> "<instruction>"\|STOP.` | répondre par une consigne, qui relance le nœud dans le même run, ou par `STOP` |
| `done` | — | la dernière phase du workflow est close | `<PHASE> closed` (`PUBLISH closed` avec le workflow du plugin) | — |

Les gates ont en plus leurs propres statuts `passed` et `failed` :
[La ligne de commande skraft](./cli.md).

## Statuts de `skraft status` <!-- #status-values -->

| Statut | Condition | `reason` |
| --- | --- | --- |
| `idle` | pas de pipeline actif | message de `no-active-pipeline` |
| `not-initialised` | le slug actif n'a aucun événement | `<slug> has no journal (events.jsonl)` |
| `tampered` | la chaîne est cassée (code de sortie 1) | message de `journal-tampered` |
| `running` | journal ouvert, run ni fini ni arrêté ; c'est aussi le statut juste après `skraft init <slug>`, avant que l'hôte ne lance quoi que ce soit | vide |
| `waiting` | une question posée et sans réponse | texte de la question |
| `done` | `run.finished` avec un statut autre que `blocked` | raison de `run.finished` |
| `blocked` | `run.finished` `blocked`, ou dernier événement `run.stopped` | raison de l'événement |

Un `step.started` ou un `phase.closed` écrit après un `run.finished` rouvre le run.

## Pièges & anti-patterns

- **Corriger `events.jsonl` à la main** : la chaîne casse et le run est `tampered`. Démarrez
  un nouveau slug.
- **Deviner le slug** : un hôte ou un agent ne choisit jamais le slug ; seul un init explicite
  change `.active-slug`.
- **Lancer deux runs sur le même slug** : le second s'arrête en `journal-changed`.
- **Passer soi-même un ADR en `Accepted` pendant un run** : la tentative est refusée
  (`adr-lifecycle`). Ratifiez-le en répondant à la question.

## Voir aussi <!-- #see-also -->

- [Phases](./phases.md)
- [Hôtes](./hosts.md)
- [Reprendre ou débloquer un run](../how-to/resume-a-run.md)
- [Lancer les gates et lire leurs preuves](../how-to/run-gates.md)
- [La ligne de commande skraft](./cli.md)
- [skraft-config.json](./skraft-config.md)
- [Le journal d'événements (chaîné)](../explanation/event-journal.md)
- [Garde-fous : zéro hook, contrôles dans le moteur](../explanation/guardrails.md)

Termes à connaître : **slug**, **journal**, **pipeline actif**, **gate** — voir le
[glossaire](./glossary.md).
