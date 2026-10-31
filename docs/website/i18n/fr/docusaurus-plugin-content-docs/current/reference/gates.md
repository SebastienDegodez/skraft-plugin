---
layout: doc
lang: fr
title: "Gates"
description: "Les gates de commandes que lance le moteur et les critères de revue (Gxx et autres identifiants) que jugent les lentilles, par phase, avec la réponse d'une lentille, la réfutation et le calcul du verdict."
---

# Gates

> Une gate est un critère binaire, écrit d'avance : une commande qui sort avec 0, ou un critère qu'une lentille de revue déclare tenu ou non.

Pourquoi des critères écrits et une revue indépendante :
[La revue avant la revue]({{ "/fr/explanation/deep-dive/review-before-review" | relative_url }}).
Où chaque revue se place dans le pipeline : [Phases]({{ "/fr/reference/phases" | relative_url }}).

## Deux sortes de gates {#kinds}

| Sorte | Identifiants | Qui la juge | Où |
| --- | --- | --- | --- |
| Gate de commandes | `build`, `format`, `lint`, `test`, `architecture`, `coverage`, `mutation` | le moteur, par le code de sortie de la commande du composant | nœuds `gates`, `mutation` et `mutation_gates` de DELIVER, `skraft gate` |
| Critère de revue | `G<n>`, et `C1`, `F1`, `B1`, `T<n>`, `E<n>`, `M<n>`, `K<n>` | une lentille, puis le moteur (DESIGN, DISTILL, DELIVER) ou `review-verdict.mjs` (DISCOVER, DISCUSS) | revues de chaque phase |
| Contrôle du moteur rattaché à un critère | G2, G10, G12, G14 (DESIGN) ; G9 (`test-integrity#patch`) ; G11 (`testability#layout`) | le moteur, sans lentille | après la tentative de l'architecte ; dans le patch d'une revue |

Un identifiant `G<n>` n'est unique que dans sa phase : G1 de DESIGN n'est pas G1 de DISTILL.
La table d'une lentille, dans son descripteur d'agent, fait foi ; une lentille met
l'identifiant dans le champ `gate` de chaque finding.

## Gates de commandes {#command-gates}

Les gates sont les commandes d'un composant dont le nom est l'un des sept ci-dessous, dans
`skraft-config.json`. Elles tournent dans cet ordre, quel que soit l'ordre du fichier, depuis la
racine du composant ; un composant s'arrête à sa première gate en échec.

| Ordre | Gate | Nœud du workflow du plugin |
| --- | --- | --- |
| 1 | `build` | `gates`, `mutation_gates` |
| 2 | `format` | `gates`, `mutation_gates` |
| 3 | `lint` | `gates`, `mutation_gates` |
| 4 | `test` | `gates`, `mutation_gates` |
| 5 | `architecture` | `gates`, `mutation_gates` |
| 6 | `coverage` | `gates`, `mutation_gates` |
| 7 | `mutation` | `mutation` |

| Règle | Détail |
| --- | --- |
| Résultat | `pass` (sortie 0) ou `fail`, classe `environment` ou `deterministic` ([classes d'échec]({{ "/fr/reference/skraft-config" | relative_url }}#failure-classes)) |
| Composant sans commande de gate | gate `none`, `fail`, classe `environment` |
| Portée | les composants modifiés depuis leur base ; `goal_gate=true` lance ensuite tous les autres ; `skraft gate --all` les lance tous |
| Arêtes | toutes les gates du nœud passent : arête `PASS` ; une échoue : arête `FAIL` (`gates` : `PASS` vers `deliver_review`, `FAIL` vers `deliver` ; `mutation` : `PASS` vers `visuals`, `FAIL` vers `kill_proposal` ; `mutation_gates` : `PASS` vers `mutation`, `FAIL` vers `kill_mutants`) |
| Mutation | le moteur lit le rapport de la commande `mutation` (`mutationReport`) et juge deux barres : **100 %** sur le cœur (Domain, Application), **80 %** sur la frontière (le reste) ; elle tourne une fois, après l'approbation de `deliver_review` ; en échec, `kill_proposal` écrit une proposition par fichier de survivants, la question `mutation-plan` laisse le développeur choisir (`APPLY`, sa consigne, `STOP`), puis `kill_mutants` applique le choix ([Phases]({{ "/fr/reference/phases" | relative_url }}#deliver)) |
| Seuils | aucun n'est configurable |
| Verrou | `gates` et `mutation` sont `locked=true` : une copie du workflow ne les retire qu'avec `unlock="<raison>"` ([Le workflow DOT]({{ "/fr/reference/workflow-dot" | relative_url }}#locked-nodes)) |
| Preuve | `gates/<composant>/<gate>-<n>.log` et un événement `gate.ran` ([Dossier de suivi et journal]({{ "/fr/reference/run-journal" | relative_url }}#gate-evidence)) |

## Critères de revue {#review-criteria}

| Sévérité | DISCOVER, DISCUSS (`review-verdict.mjs`) | DESIGN, DISTILL, DELIVER (moteur) |
| --- | --- | --- |
| `blocker` | `REJECTED` | `NEEDS_REWORK` une fois confirmé par `finding-refuter` |
| `high` | `NEEDS_REWORK` | `NEEDS_REWORK` une fois confirmé |
| `medium` | `NEEDS_REWORK` | `NEEDS_REWORK` une fois confirmé |
| `low` | `APPROVED`, noté | `APPROVED`, noté |

---

## DISCOVER — G1 à G6 {#discover}

`backlog-discoverer` (plugin skraft-backlog) lance 3 lentilles ; `review-verdict.mjs --phase
discover` calcule le verdict. Objet : le rapport de triage et la proposition de sprint.

| ID | Lentille | Critère | Sévérité |
| --- | --- | --- | --- |
| **G1** | `discovery-completeness-lens` | Les 3 modes de découverte ont été utilisés, ou le rapport dit pourquoi un mode est sauté. | HIGH |
| **G2** | `discovery-completeness-lens` | Aucune issue P0 ou P1 ouverte n'est absente du rapport de triage. | BLOCKER |
| **G3** | `discovery-prioritization-lens` | Toute P0 porte une justification écrite ; aucune inversion de priorité dans un domaine. | HIGH |
| **G4** | `discovery-prioritization-lens` | La capacité déclarée est respectée ; rien au-delà de 8 points dans le sprint ; aucune P2/P3 retenue tant qu'une P0/P1 attend. | HIGH |
| **G5** | `discovery-duplicate-lens` | Deux issues triées ne décrivent pas le même problème sans être marquées doublons. | HIGH |
| **G6** | `discovery-duplicate-lens` | Toute paire seulement liée est notée avec une recommandation. | MEDIUM |

## DISCUSS — G1 à G8 {#discuss}

`backlog-planner` (plugin skraft-backlog) lance 4 lentilles ; `review-verdict.mjs --phase
discuss` calcule le verdict. Objet : les stories et leurs critères d'acceptation.

| ID | Lentille | Critère | Sévérité |
| --- | --- | --- | --- |
| **G1** | `planning-invest-lens` | Chaque story satisfait les 6 critères INVEST. | HIGH |
| **G2** | `planning-invest-lens` | Chaque story est livrable seule ; le graphe de dépendances du sprint n'a pas de cycle. | HIGH |
| **G3** | `planning-ac-quality-lens` | Chaque story porte au moins trois critères, dont aucun n'est une étape d'implémentation. | HIGH |
| **G4** | `planning-ac-quality-lens` | Aucun critère n'admet deux lectures pour un expert métier sans connaissance du code. | BLOCKER |
| **G5** | `planning-coherence-lens` | Chaque story tient dans le thème du milestone et sa fenêtre sans décomposition. | HIGH |
| **G6** | `planning-coherence-lens` | Le graphe de dépendances est acyclique et la séquence de livraison le respecte. | BLOCKER |
| **G7** | `planning-dor-lens` | Chaque story passe les huit items du Definition of Ready. | BLOCKER |
| **G8** | `planning-dor-lens` | Aucun anti-pattern CRITIQUE ni HAUT. | BLOCKER pour CRITIQUE ; HIGH sinon |

Une story à qui manquent deux items du DoR ou plus (deux findings G7) rend le verdict
`REJECTED`, quelle que soit leur sévérité.

## DESIGN {#design}

Revue `design_review` : 3 lentilles, verdict calculé par le moteur. Un ADR `Proposed` écrit par
le passage en cours satisfait tout critère qui demande un ADR `Accepted` et tombe sous tout
critère qui en interdit un.

| ID | Lentille | Critère | Sévérité |
| --- | --- | --- | --- |
| **G1** | `consistency` | Tout engagement structurel d'un diagramme ou du scan structurel a un ADR `Accepted`, ou `Proposed` de ce passage, qui le justifie. | blocker |
| **G2** | `consistency` | Deux ADR ne se contredisent pas ; chaque ligne de `docs/adr/supersessions.md` a son nouvel ADR portant la ligne `**Supersedes:**`. | blocker |
| **G10** | `consistency` | Le journal de rétro-propagation de la matrice de cohérence explique chaque réécriture de réconciliation. | blocker |
| **G12** | `consistency` | Chaque ligne d'un `supersession-plan-{story}.md` a son nouvel ADR portant `**Supersedes:**`, et aucun modèle d'événements, diagramme ou contrat ne cite encore l'ADR remplacé comme source de vérité. | blocker |
| **G14** | `consistency` | Un ADR `Status: Rejected` ne tient que si une story ou une force mesurable du lot a posé la question et que sa section Alternatives nomme l'option retenue. | blocker |
| **C1** | `consistency` | Context map, diagrammes, contrats et modèle d'événements nomment les mêmes contextes, agrégats, commandes, événements et champs, en accord avec la recherche et la story. | high |
| **G3** | `architecture-compliance` | Domain et Application ne dépendent de rien dans Infrastructure ni API. | blocker |
| **G4** | `architecture-compliance` | Chaque interface applicative (repository, gateway, publisher) est définie dans Domain ou Application, dans la couche que l'ADR de l'agrégat enregistre, jamais dans Infrastructure. | blocker |
| **G5** | `architecture-compliance` | Chaque agrégat ne fait respecter que ses propres invariants et désigne les autres agrégats par leur ID. | high |
| **G6** | `architecture-compliance` | Le context map étiquette chaque relation entre contextes d'un pattern explicite (ACL, Conformist, Shared Kernel, Partnership, Open Host Service, Published Language). | high |
| **G16** | `architecture-compliance` | Les interfaces comparables partagent la même forme d'état, de retour et d'erreur et les mêmes noms de champs, sauf divergence justifiée par un ADR. | high |
| **G7** | `fitness` | Chaque story correspond à au moins une Command ou Query du modèle d'événements ou des contrats. | high |
| **G8** | `fitness` | Chaque Command a au moins un événement de domaine pour son succès ; les Queries en sont exemptées. | high |
| **G9** | `fitness` | Chaque agrégat, contexte, adoption d'Event Sourcing ou Saga remonte à une story qui l'exige. | medium |
| **G11** | `fitness` | Tout ADR adoptant CQRS, Event Sourcing, Saga, cohérence éventuelle, découpage de service ou ACL cite une force admissible et évalue l'option « faire sans ». | high |
| **G15** | `fitness` | Aucun ADR ne ratifie un socle déjà imposé par un skill `clean-architecture-*` ou un test d'architecture. | high |
| **G17** | `fitness` | Chaque ADR de la passe décide d'une frontière de couche, d'une frontière d'agrégat, d'un contexte borné, d'un pattern ajoutant de la complexité ou d'une préoccupation transverse, et pèse un vrai compromis ; un autre sujet est `ADR-INFLATION`, aucune alternative pesée est `NON-DECISION`. | high |
| **G18** | `fitness` | Chaque ADR de la passe tient une décision au niveau décision : ni signature complète, ni chemin de fichier, ni valeurs d'enum, ni inventaire de Value Objects, ni arbre de routes, ni référence ticket, AC ou PRD au-delà de la story déclencheuse. | medium |
| **F1** | `fitness` | Chaque attribut qualité que la story ou la recherche énonce a un élément de conception qui y répond. | high |

**Contrôles du moteur.** Après chaque tentative de `solution-architect`, sans lentille
([`design-records`]({{ "/fr/reference/run-journal" | relative_url }}#statuses-and-codes)) :

| Critère | Contrôle |
| --- | --- |
| G10 | un `consistency-matrix-<story>.md` dans le dossier de suivi, sa ligne `consistency-gate` à `PASS` |
| docs-relied-on | la matrice a une ligne `docs-relied-on:` (chemins relatifs au dépôt séparés par des virgules, accents graves permis, séparateurs `/` ou `\`) qui liste au moins un fichier sous `docs/adr/`, `docs/architecture/`, `docs/domain/event-model/` ou `docs/features/`, et chaque chemin listé est un fichier régulier lisible de la copie de travail. Un chemin ne compte que depuis son début (pas ré-ancré depuis `mydocs/`, un chemin absolu ou `../docs/`), un chemin avec un segment `.` ou `..` n'est pas listé, un `:ligne`, `#ancre` ou point final est ôté, et un dossier ou tout autre fichier de `docs/` ne compte pas |
| G14 | aucun ADR écrit par le run nommé `*-rejected.md`, `*-accepted.md`, `*-deprecated.md` ou `*-superseded.md` |
| G2, G12 | chaque `**Supersedes:** ADR-MMM` d'un ADR écrit par le run a sa ligne dans le registre `docs/adr/supersessions.md` |
| G2 | chaque ADR écrit par le run a sa ligne dans `docs/adr/decisions-index.md` |
| G2 | un ADR de la branche de base ne change que ses lignes de statut et n'est jamais supprimé (`adr-lifecycle`) |

Un manquement renvoie l'architecte avec une ligne par trace ; après sa dernière tentative, le
run s'arrête avec `design-records`. La matrice de cohérence est aussi la sortie déclarée de DESIGN : quand
elle manque, le run s'arrête avec `missing-outputs`.

## DISTILL {#distill}

Revue `distill_review` : 4 lentilles, verdict calculé par le moteur.

| ID | Lentille | Critère | Sévérité |
| --- | --- | --- | --- |
| **G1** | `coverage` | Chaque critère d'acceptation a au moins un scénario ; aucun scénario sans critère source ; chaque valeur métier d'un scénario égale celle de son critère. | blocker |
| **G2** | `coverage` | Chaque règle métier a ses cas limites et ses cas négatifs ou d'erreur, tirés des exemples de la story ; un cas d'entrée technique n'est jamais demandé. | high |
| **G3** | `business-alignment` | Chaque terme des étapes Given/When/Then vient du vocabulaire métier de la story ; aucun nom de classe, de méthode ni de framework. | high |
| **G4** | `business-alignment` | Aucune étape ne porte un détail d'implémentation (verbe ou code HTTP, terme ORM ou base de données, `Repository`, `Service`, `Handler`, `Controller`, `UseCase`, cas d'entrée technique). | blocker |
| **B1** | `business-alignment` | Chaque scénario exprime un résultat que la story demande ; aucun ne décrit un comportement qu'elle ne demande pas. | high |
| **G5** | `testability` | Chaque étape est sans ambiguïté et implémentable seule. | high |
| **G6** | `testability` | Chaque scénario a une entrée dans le plan d'implémentation. | high |
| **G11** | `testability` | Chaque cas d'usage nouveau a son test d'acceptation à l'emplacement des tests unitaires de son langage (.NET : projet `<Context>.UnitTest` ; Java : module `-unit-test` ; sinon `<chemin des tests>/unit/`). | blocker |
| **T1** | `testability` | Chaque scénario et chaque test vérifient un comportement par un résultat observable et ne dépendent d'aucun temps, ordre ou aléa qu'ils ne fixent pas. | high |
| **T2** | `testability` | Chaque valeur d'entrée et attendue du test d'acceptation externe égale le `.feature` mot pour mot ; le test ne porte que le premier scénario. | blocker |
| **T3** | `testability` | Le test d'acceptation externe existe et son premier scénario échoue sur une assertion métier ; le code de production du patch est un squelette dont les signatures rendent la valeur vide de leur type. | blocker |
| **G7** | `boundary-enforcement` | Chaque scénario du plan de test vise le cas d'usage Application que nomment les contrats. | blocker |
| **G8** | `boundary-enforcement` | Le plan de test identifie au moins un scénario walking skeleton par flux. | high |
| **E1** | `boundary-enforcement` | Le test d'acceptation ne pilote que ce cas d'usage : jamais d'appel, de construction ni d'assertion sur un élément interne du domaine, un repository ou une classe d'infrastructure. | blocker |
| **E2** | `boundary-enforcement` | Les doublures ne remplacent que des dépendances du bord extérieur, jamais un objet du domaine ni le cas d'usage ; le squelette de DISTILL est le vrai module. | high |

**Contrôle du moteur.** G11 : le moteur lit où le patch ajoute des fichiers de test et rapporte
sous la lentille `testability#layout` (sévérité blocker) un test ajouté hors des emplacements
unitaire et intégration de la stack, et un composant qui gagne des tests sans aucun dans son
emplacement unitaire.

## DELIVER {#deliver}

DELIVER passe par les gates `gates`, l'appel `deliver_review` du workflow `review`, puis la gate
`mutation` ; quand elle échoue, la revue `mutation_review` (lentille `test-integrity`) juge les
tests de `kill_mutants` avant `mutation_gates`. Les mêmes
lentilles jugent une pull request par `skraft review --pr`.

| ID | Lentille | Critère | Sévérité |
| --- | --- | --- | --- |
| **G7** | `test-integrity` | Aucun test de façade : chaque test peut échouer quand le comportement qu'il nomme casse. | blocker |
| **G9** | `test-integrity` | Aucun test changé pour passer : ni assertion affaiblie, ni test supprimé, ni skip ou focus ajouté, ni valeur d'acceptation qui s'écarte du `.feature`. | blocker |
| **G4** | `architecture-boundaries` | Aucune doublure d'un type Domain ou Application dans un test unitaire. | blocker |
| **G5** | `architecture-boundaries` | Les dépendances pointent vers l'intérieur : Domain → rien, Application → Domain, API et Infrastructure → Application ; sautée pour un composant dont la gate `architecture` a passé dans ce run. | blocker |
| **G10** | `architecture-boundaries` | Le code du domaine suit les 9 règles d'Object Calisthenics. | medium |
| **G11** | `cold-reader` | Tests et code de production parlent la langue du métier et montrent leur intention. | medium |
| **M1** | `mock-fidelity` | Le test suit la stratégie de mocking de son composant. | high |
| **M2** | `mock-fidelity` | Le mock est branché dans l'hôte de test. | blocker |
| **M3** | `mock-fidelity` | Aucun appel réel vers l'aval ne fuit. | blocker |
| **M4** | `mock-fidelity` | La doublure remplace l'aval, jamais le système testé. | high |
| **K1** | `contract-fidelity` | Quand le composant demande des tests de contrat, le patch a un test d'intégration qui démarre l'application en processus et l'appelle en HTTP. | blocker |
| **K2** | `contract-fidelity` | Quand le composant demande des tests de contrat, le patch a aussi une vérification fournisseur Microcks (`TestEndpointAsync`, runner `OPEN_API_SCHEMA`). | high |
| **K3** | `contract-fidelity` | Une vérification fournisseur Microcks vérifie son résultat. | blocker |
| **K4** | `contract-fidelity` | Le test d'intégration vérifie le contrat de la réponse. | high |
| **K5** | `contract-fidelity` | Aucun appel réel vers l'aval ne fuit. | blocker |

`mock-fidelity` ne tourne que sur des changements qui touchent des mocks (`when="mock"`),
`contract-fidelity` que sur des changements qui touchent des contrats (`when="contract"`)
([déclencheurs]({{ "/fr/reference/workflow-dot" | relative_url }}#conditional-lenses)).

Le moteur vérifie aussi, sans identifiant de gate, les commits de chaque tentative
(`commits.checked`) : message conventionnel, `Refs: #<issue>` en dernière ligne, aucune issue
fermée, un commit vert précédé d'un rouge, chaque rouge rejoué en échec
([`tdd.replay`]({{ "/fr/reference/skraft-config" | relative_url }}#tdd)).

## Revue : réponse, réfutation, verdict {#review-run}

Ce qui suit vaut pour les revues que le moteur conduit (DESIGN, DISTILL, DELIVER, `skraft review
--pr`).

### Réponse d'une lentille {#lens-answer}

Une lentille termine son dernier message par un document YAML dans un bloc
clôturé ; le moteur lit le dernier bloc clôturé du message.

```yaml
lens: test-integrity
verdict: fail            # pass | fail | inconclusive
findings:                # [] quand elle ne trouve rien
  - id: F1
    gate: G9             # la gate de la table de la lentille
    severity: blocker    # blocker | high | medium | low
    location: "tests/Orders.UnitTest/RefundTests.cs:42"
    description: "le montant attendu 90 est devenu Assert.NotNull"
    suggestion: "rétablir Assert.Equal(90, refund.Amount)"   # facultatif
```

| Règle | Détail |
| --- | --- |
| Clés | seulement `lens`, `verdict`, `findings` ; par finding `id`, `gate`, `severity`, `location`, `description`, `suggestion` ; toute autre clé refuse la réponse |
| Obligatoire | `gate` et `description` ; un `id` absent devient le premier `F<n>` libre |
| Valeurs | textes libres entre guillemets doubles ou en bloc littéral ; ni ancre, ni alias, ni tag ; casse de `verdict` et `severity` normalisée |
| Plafond | au plus 20 findings ; un `pass` avec un finding blocker, high ou medium est refusé |
| Textes | ramenés sur une ligne et tronqués (description : 500 caractères) ; `location` rendue relative à la copie de travail, séparée par `/`, sans `./`, son `:ligne` gardé (un chemin hors de la copie de travail reste absolu) |
| Réponse refusée | la lentille est relancée une fois avec la raison ; une seconde réponse illisible arrête le run avec `lens-unreadable` ; une reprise ne relance que les lentilles dont la réponse était illisible |

### G9 lu par le moteur {#g9-engine}

Quand `test-integrity` relit les changements, le moteur lit aussi le patch des
fichiers de test (fichiers source sous un dossier `test`, `tests`, `spec` ou `__tests__`, ou
nommés comme `test_*.py`, `*.test.ts`, `*_test.go`, `*Tests.cs`, `*IT.java` ; fixtures, snapshots
et testdata exclus) et journalise ce qu'il trouve sous la lentille `test-integrity#patch` (agent
`skraft-engine`) : un skip ou un focus ajouté (`[Fact(Skip = …)]`, `[Ignore]`, `.skip`, `.only`,
`.todo`, `xit(`, `fit(`, `@pytest.mark.skip`/`skipif`/`xfail`, `@Disabled`, `t.Skip(`…, blocker à
`chemin:ligne`), un fichier de test supprimé (blocker), des lignes d'assertion retirées avec
moins de lignes ajoutées (high). Le brief de `test-integrity` les liste pour que la lentille ne
les signale pas une seconde fois ; ils partent au réfuteur comme ceux d'une lentille.

### Réfutation {#refutation}

Les findings de lentilles différentes au même `chemin:ligne` (le chemin normalisé
comme ceux du patch : `./src\Checkout.cs:12` est `src/Checkout.cs:12`) et de même sévérité
forment un groupe. Chaque groupe de findings blocker, high ou medium part une fois chez
`finding-refuter`, son libellé et son brief nommant chaque lentille du groupe, avec les entrées et
les skills de ces lentilles. Il répond `confirmed`, `refuted` (sa `reason` cite le `chemin:ligne`
lu) ou `unverifiable`, et la réponse vaut pour chaque finding du groupe. Un finding réfuté ne
compte pas ; un finding invérifiable compte, comme celui dont la vérification a été illisible
deux fois.

### Verdict {#verdict}

Une lentille qui répond `inconclusive`, ou `fail` sans finding blocker, high ou
medium, bloque la revue avec `lens-inconclusive`, en nommant chacune de ces lentilles et ce
qu'elle a noté : le travail n'est pas renvoyé, aucun finding n'est vérifié, et le run pose la
question `blocked` sur le nœud de revue. Sinon
`NEEDS_REWORK` quand un finding blocker, high ou medium compte, sinon `APPROVED` (les findings
low sont des notes). Les findings retenus vont dans le brief suivant de l'agent de la phase, un
groupe sur une ligne qui cite chacune de ses lentilles.
Le résumé donne le statut, puis les findings réfutés et les notes mis de côté, chacun cité
(`APPROVED: no finding counts; 2 refuted (consistency F1, fitness F1); 1 note (coverage F3)`,
`APPROVED: every lens passed` quand aucune lentille n'a rien trouvé) ; la progression (le panneau,
le journal du workflow) liste dessous chaque finding réfuté avec la raison du réfuteur et chaque note, puis
l'emplacement de `verdict.yaml`, pour qu'un humain puisse quand même les faire corriger.

### Re-revue incrémentale {#incremental}

À une passe suivante, une lentille dont le résultat précédent était
`pass` sans finding, et dont l'empreinte n'a pas changé, n'est pas relancée : son résultat est
journalisé de nouveau avec `reused: true`. L'empreinte couvre ses entrées, le contenu de chaque
`SKILL.md` qu'elle lit (par nom de skill : déplacer la copie de travail ou le plugin n'y change
rien), les fichiers de règles du projet et le contenu de chaque chemin changé qu'elle lit.

### Verdict de DISCOVER et DISCUSS {#backlog-verdict}

`review-verdict.mjs` lit les réponses des lentilles et écrit le fichier de revue ; son code de
sortie porte le verdict.

| Constat | Verdict | Code de sortie |
| --- | --- | --- |
| au moins un finding `blocker`, ou une story avec deux findings G7 ou plus (DISCUSS) | `REJECTED` | 4 |
| sinon, un finding `medium` ou plus, une lentille `fail` ou `inconclusive`, ou un finding sur une gate hors de la phase | `NEEDS_REWORK` | 3 |
| sinon (findings `low` seuls, ou aucun) | `APPROVED` | 0 |
| ligne mal formée ou réponse illisible | — | 1 |

## Voir aussi {#see-also}

- [Phases]({{ "/fr/reference/phases" | relative_url }})
- [Le workflow DOT]({{ "/fr/reference/workflow-dot" | relative_url }})
- [Catalogue des agents et lentilles]({{ "/fr/dashboard/" | relative_url }})
- [Lancer les gates]({{ "/fr/how-to/run-gates" | relative_url }})
- [La revue avant la revue]({{ "/fr/explanation/deep-dive/review-before-review" | relative_url }})

Termes à connaître : **gate**, **lentille**, **finding**, **BLOCKER**, **INVEST**, **walking
skeleton** — voir le [glossaire]({{ "/fr/reference/glossary" | relative_url }}).
