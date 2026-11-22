---
title: "Gates"
description: "Les gates de commandes du moteur et les critères de revue (Gxx et autres) des lentilles, par phase, avec la réponse d'une lentille, la réfutation et le verdict."
---

# Gates

Une gate est un critère binaire, écrit d'avance : une commande qui sort avec 0 dans une exécution tracée, ou un critère qu'une lentille de revue déclare tenu ou non.

Pourquoi des critères écrits et une revue indépendante :
[La revue avant la revue](../explanation/deep-dive/review-before-review.md).
Où chaque revue se place dans le pipeline : [Phases](./phases.md).

## Deux sortes de gates <!-- #kinds -->

| Sorte | Identifiants | Qui la juge | Où |
| --- | --- | --- | --- |
| Gate de commandes | `build`, `format`, `lint`, `test`, `architecture`, `coverage` | l'ingénieur logiciel la lance par `skraft_repl` ; le moteur journalise la trace signée et la lentille `quality-gates` la juge | DELIVER, dans la revue |
| Critère de revue | `G<n>`, et `C1`, `F1`, `B1`, `T<n>`, `E<n>`, `M<n>`, `K<n>` | une lentille, puis le moteur (DESIGN, DISTILL, DELIVER) ou `review-verdict.mjs` (DISCOVER, DISCUSS) | revues de chaque phase |
| Contrôle du moteur rattaché à un critère | G2, G10, G12, G14 (DESIGN) ; G11 (`testability#layout`) (DISTILL) ; G9 (`test-integrity#patch`) | le moteur, sans lentille | après la tentative de l'architecte ; après la tentative du concepteur d'acceptation ; dans le patch d'une revue |

Un identifiant `G<n>` n'est unique que dans sa phase : G1 de DESIGN n'est pas G1 de DISTILL.
La table d'une lentille, dans son descripteur d'agent, fait foi ; une lentille met
l'identifiant dans le champ `gate` de chaque finding.

## Gates de commandes <!-- #command-gates -->

Les gates sont les commandes d'un composant dont le nom est l'un des six ci-dessous, dans
`skraft-config.json`. Le moteur n'en lance aucune : dans DELIVER, l'ingénieur logiciel lance
chacune par l'outil MCP `skraft_repl` (`gate(name, command, { cwd })`, voir [Le REPL](./repl.md)),
et le moteur journalise la trace signée de ces exécutions et la remet à la revue DELIVER, qui la juge.

| Gate | Ce qu'elle prouve |
| --- | --- |
| `build` | le composant compile |
| `format` | le code est formaté |
| `lint` | le linter se tait |
| `test` | toute la suite de tests passe ; l'exécution de la ligne de commit (toute la suite non filtrée, enchaînée à `git add` et `git commit`, étiquette `green`) est cette exécution |
| `architecture` | les règles de dépendance tiennent |
| `coverage` | le seuil de couverture tient |

`mutation` n'est pas une gate : c'est une recette de la session du développeur ([Lancer la mutation](../how-to/run-mutation.md)).

| Règle | Détail |
| --- | --- |
| Qui lance | l'ingénieur logiciel, par `skraft_repl`, dans chaque composant que l'histoire a modifié |
| Gate absente | une gate dont les documents du projet ne nomment aucune commande se déclare par `absent(gate, component, reason)` ; `test` n'est jamais absente |
| Trace | `logs/runs/<step>-<visit>-<attempt>/runs.jsonl`, signée ; un dossier par tentative |
| Jugement | la lentille `quality-gates` de la revue DELIVER (ci-dessous) ; le moteur ne refuse aucune tentative pour une exécution |
| Journal | `evidence.checked` avec `runs: [{ run, gate, cwd, log, sha256 }]`, seulement quand la trace se lit jusqu'à ses signatures ; le run rouge du concepteur porte `red: true` ([Dossier de suivi et journal](./run-journal.md#gate-evidence)) |
| Rapport | le tableau « Preuves de qualité » de la pull request, du commentaire d'issue et de `qa-report.md` (Gate, Dossier, Exécution, Preuve), la ligne du panneau Claude Code `Preuves de qualité : build exécution 1, test exécution 4` et la ligne du canvas Copilot |
| Seuils | aucun n'est configurable ; le seuil de mutation (80 sur le cœur, 80 sur la frontière) est un nombre en lecture seule de la vue de configuration |

### Workflows qui contiennent encore une gate

Un workflow éjecté plus tôt qui contient un nœud gate ou l'un de ses attributs est refusé, un
message par attribut :

| Trouvé dans le workflow | Message |
| --- | --- |
| un nœud de forme `parallelogram` ou un attribut `gate` | `a gate node is gone: skraft runs no gate. The software engineer runs each gate through skraft_repl, and the DELIVER review reads the traced runs of its attempt; remove the node and its PASS and FAIL edges (skraft workflow diff shows the plugin's pipeline)` |
| `goal_gate`, `locked` ou `unlock` | `<attribut> is gone with the gate node: skraft runs no gate` |
| `each` ou `proposal` | `<attribut> is gone with the mutation the engine ran: mutation testing is a recipe of the session (the skraft-mutation skill), not a node` |

Un run en cours qui pointe sur un nœud retiré (`gates`, `mutation`, `mutation_gates`,
`kill_proposal`, `kill_mutants`, ou une étape qui lançait des gates) se bloque avec le code
`node-retired` : « the node X was retired: skraft runs no gate and no mutation any more ... start
the story again with the plugin's workflow ».

## Critères de revue <!-- #review-criteria -->

| Sévérité | DISCOVER, DISCUSS (`review-verdict.mjs`) | DESIGN, DISTILL, DELIVER (moteur) |
| --- | --- | --- |
| `blocker` | `REJECTED` | `NEEDS_REWORK` une fois confirmé par `finding-refuter` |
| `high` | `NEEDS_REWORK` | `NEEDS_REWORK` une fois confirmé |
| `medium` | `NEEDS_REWORK` | `NEEDS_REWORK` une fois confirmé |
| `low` | `APPROVED`, noté | `NEEDS_REWORK` une fois confirmé, que sa lentille ait répondu `fail` ou `pass` |

---

## DISCOVER — G1 à G6 <!-- #discover -->

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

## DISCUSS — G1 à G8 <!-- #discuss -->

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

## DESIGN <!-- #design -->

Revue `design_review` : 3 lentilles, verdict calculé par le moteur. Un ADR `Proposed` écrit par
le passage en cours satisfait tout critère qui demande un ADR `Accepted` et tombe sous tout
critère qui en interdit un.

| ID | Lentille | Critère | Sévérité |
| --- | --- | --- | --- |
| **G1** | `consistency` | Tout engagement structurel d'un diagramme ou du scan structurel est décidé dans une source que la matrice cite : la documentation d'architecture du projet, un ADR `Accepted` ou un ADR `Proposed` de ce passage. Un ADR absent n'est pas un constat en soi. | blocker |
| **G2** | `consistency` | Deux ADR ne se contredisent pas ; chaque ligne de `docs/adr/supersessions.md` a son nouvel ADR portant la ligne `**Supersedes:**`. | blocker |
| **G10** | `consistency` | Le journal de rétro-propagation de la matrice de cohérence explique chaque réécriture de réconciliation. | blocker |
| **G12** | `consistency` | Chaque ligne d'un `supersession-plan-{story}.md` a son nouvel ADR portant `**Supersedes:**`, et aucun modèle d'événements ni diagramme ne cite encore l'ADR remplacé comme source de vérité. | blocker |
| **G14** | `consistency` | Un ADR `Status: Rejected` ne tient que si une story ou une force mesurable du lot a posé la question et que sa section Alternatives nomme l'option retenue. | blocker |
| **C1** | `consistency` | Context map, diagrammes et modèle d'événements nomment les mêmes contextes, agrégats, commandes, événements et champs (ceux que le modèle d'événements donne à chacun), en accord avec la recherche et la story. | high |
| **G3** | `architecture-compliance` | Domain et Application ne dépendent de rien dans Infrastructure ni API. | blocker |
| **G4** | `architecture-compliance` | Chaque interface applicative (repository, gateway, publisher) est définie dans Domain ou Application, dans la couche que la conception tactique enregistre, jamais dans Infrastructure. Cette couche ne relève jamais d'une ADR. | blocker |
| **G5** | `architecture-compliance` | Chaque agrégat ne fait respecter que ses propres invariants et désigne les autres agrégats par leur ID. | high |
| **G6** | `architecture-compliance` | Le context map étiquette chaque relation entre contextes d'un pattern explicite (ACL, Conformist, Shared Kernel, Partnership, Open Host Service, Published Language). | high |
| **G16** | `architecture-compliance` | Les interfaces comparables partagent la même forme d'état, de retour et d'erreur et les mêmes noms de champs, sauf divergence justifiée par un ADR. | high |
| **G7** | `fitness` | Chaque story correspond à au moins une Command ou Query du modèle d'événements. | high |
| **G8** | `fitness` | Chaque Command d'un bounded context métier a au moins un événement de domaine pour son succès ; les Queries et les composants front (qui ne font que déclencher la Command d'un contexte métier) en sont exemptés. | high |
| **G9** | `fitness` | Chaque agrégat, contexte, adoption d'Event Sourcing ou Saga remonte à une story qui l'exige. | medium |
| **G11** | `fitness` | Tout ADR adoptant CQRS, Event Sourcing, Saga, cohérence éventuelle ou découpage de service cite une force admissible et évalue l'option « faire sans ». | high |
| **G15** | `fitness` | Aucun ADR ne ratifie un socle déjà imposé par un skill `clean-architecture-*` ou un test d'architecture, l'emplacement d'une interface de repository compris, ni ne répète ce que la documentation du projet ou un ADR `Accepted` décide déjà. | high |
| **G17** | `fitness` | Chaque ADR de la passe décide d'un choix coûteux à défaire qui dépasse un contexte borné (frontière de couche, frontière d'agrégat entre contextes, isolation ou couplage entre contextes, pattern ajoutant de la complexité entre contextes, préoccupation transverse) et pèse un vrai compromis ; un choix interne à un contexte, un contexte ou une relation, ou un choix justifié par un besoin futur est `ADR-INFLATION`, aucune alternative pesée est `NON-DECISION`. | high |
| **G18** | `fitness` | Chaque ADR de la passe tient une décision au niveau décision : ni signature complète, ni valeurs d'enum, ni inventaire de Value Objects, ni arbre de routes, ni référence de traçabilité (user story, PRD ou id d'exigence), story déclencheuse comprise. Un attribut de qualité cité avec sa mesure comme force de la décision est admis. Un fichier de code, un critère d'acceptation, un ticket ou un autre ADR cité hors de la ligne `Supersedes:` ou `Amends:` est refusé par le moteur, pas par la lentille. | medium |
| **F1** | `fitness` | Chaque attribut qualité que la story ou la recherche énonce a un élément de conception qui y répond. | high |

**Contrôles du moteur.** Après chaque tentative de `solution-architect`, sans lentille
([`design-records`](./run-journal.md#statuses-and-codes)) :

| Critère | Contrôle |
| --- | --- |
| G10 | un `consistency-matrix-<story>.md` dans le dossier de suivi, sa ligne `consistency-gate` à `PASS` |
| docs-relied-on | la matrice a une ligne `docs-relied-on:` (chemins relatifs au dépôt séparés par des virgules, accents graves permis, séparateurs `/` ou `\`) qui liste au moins un fichier sous `docs/adr/`, `docs/architecture/`, `docs/domain/event-model/` ou `docs/features/`, ou un `.feature` là où son composant le garde, et chaque chemin listé est un fichier régulier lisible de la copie de travail. Un chemin ne compte que depuis son début (pas ré-ancré depuis `mydocs/`, un chemin absolu ou `../docs/`), un chemin avec un segment `.` ou `..` n'est pas listé, un `:ligne`, `#ancre` ou point final est ôté, et un dossier ou tout autre fichier de `docs/` ne compte pas |
| G14 | aucun ADR écrit par le run nommé `*-rejected.md`, `*-accepted.md`, `*-deprecated.md` ou `*-superseded.md` |
| G2, G12 | chaque `**Supersedes:** ADR-MMM` d'un ADR écrit par le run a sa ligne dans le registre `docs/adr/supersessions.md` |
| G2 | chaque ADR écrit par le run a sa ligne dans `docs/adr/decisions-index.md` |
| G2 | un ADR de la branche de base ne change que ses lignes de statut et n'est jamais supprimé (`adr-lifecycle`) |

Un manquement renvoie l'architecte avec une ligne par trace ; après sa dernière tentative, ou
deux tentatives de suite refusées de la même façon, le run pose la question `blocked`, et `STOP`
le termine avec `design-records`. La matrice de cohérence est aussi la sortie déclarée de DESIGN :
quand elle manque, `STOP` le termine avec `missing-outputs`.

## DISTILL <!-- #distill -->

Revue `distill_review` : 4 lentilles, verdict calculé par le moteur.

| ID | Lentille | Critère | Sévérité |
| --- | --- | --- | --- |
| **G1** | `coverage` | Chaque critère d'acceptation a son propre scénario ; aucun scénario ne tient deux critères ; aucun scénario sans critère source ; chaque valeur métier d'un scénario égale celle de son critère. | blocker |
| **G2** | `coverage` | Chaque règle métier a ses cas limites et ses cas négatifs ou d'erreur, tirés des exemples de la story ; un mapping Gherkin ou un exemple écrit dans un document DESIGN n'est pas un exemple de la story, et une variante qu'une règle antérieure décide déjà n'ajoute aucune frontière ; un cas d'entrée technique n'est jamais demandé. | high |
| **G3** | `business-alignment` | Chaque terme des étapes Given/When/Then vient du vocabulaire métier de la story ; aucun nom de classe, de méthode ni de framework. | high |
| **G4** | `business-alignment` | Aucune étape ne porte un détail d'implémentation (verbe ou code HTTP, terme ORM ou base de données, `Repository`, `Service`, `Handler`, `Controller`, `UseCase`, cas d'entrée technique). | blocker |
| **B1** | `business-alignment` | Chaque scénario exprime un résultat que la story demande ; aucun ne décrit un comportement qu'elle ne demande pas. | high |
| **G5** | `testability` | Chaque étape est sans ambiguïté et implémentable seule. | high |
| **G6** | `testability` | Chaque scénario a une entrée dans le plan d'implémentation ; son tableau de groupes nomme chaque scénario du plan de test une fois, aucun qu'il ne liste pas, S1 dans le groupe 1 ; deux lignes du plan de test ne partagent pas un titre. | high |
| **G11** | `testability` | Chaque test vit là où sa sorte le place : le walking skeleton, un test simple sans Gherkin, à l'emplacement des tests d'intégration de son composant (Java : une classe `*IT`), en entrant par le vrai point d'entrée ; le test d'acceptation de chaque scénario, S1 compris, le binding de son Gherkin, à l'emplacement des tests unitaires de son langage (.NET : projet `<Context>.UnitTest`, `<Context>.UnitTests` ou `<Context>.Tests` ; Java : une classe `*Test` sous le `src/test` d'un module, ou un module `-unit-test(s)` ; Python, TypeScript, JavaScript, React : `<chemin des tests>/unit/`), en entrant par le cas d'usage. | blocker |
| **T1** | `testability` | Chaque scénario et chaque test vérifient un comportement par un résultat observable et ne dépendent d'aucun temps, ordre ou aléa qu'ils ne fixent pas. | high |
| **T2** | `testability` | Le patch porte le walking skeleton (sauf si l'histoire est exemptée) et le test d'acceptation de chaque scénario, chaque nom commençant par le numéro de son scénario ; un scénario sans test, ou un test sauté, est un finding. Chaque valeur d'entrée et attendue de chaque test d'acceptation égale le `.feature` mot pour mot ; le walking skeleton affirme le statut, la forme et une valeur que nomme S1, et aucune valeur absente du `.feature`. | blocker |
| **T3** | `testability` | Le walking skeleton et le test d'acceptation du scénario en cours existent et chacun échoue sur une assertion, pas sur une erreur de compilation, d'import ou de mise en place ; le code de production du patch est un squelette dont les signatures rendent la valeur vide de leur type, avec, pour le walking skeleton, le point d'entrée, les ports et les adaptateurs de sa chaîne câblés dans la composition root. | blocker |
| **T4** | `testability` | Gherkin bien formé : chaque `.feature` que cite le plan de test existe sous un dossier que nomme le `bdd` de son composant ; chaque scénario dit Given, When et Then ; les `Examples` d'un plan remplissent chaque variable ; deux scénarios d'un fichier ne partagent pas un titre ; mots-clés en anglais. | blocker |
| **G7** | `boundary-enforcement` | Chaque scénario du plan de test vise un cas d'usage Application que nomme le modèle d'événements (une de ses Commands ou Queries) ; une étape du plan d'implémentation qui n'écrit le test d'acceptation d'aucun scénario (un test API ou HTTP d'un cercle suivant) est hors de sa portée. | blocker |
| **G8** | `boundary-enforcement` | L'histoire a un walking skeleton qui parcourt S1, tagué `@walking-skeleton`, dans un composant back : un test simple sans Gherkin qui pilote le vrai point d'entrée à travers le cas d'usage jusqu'aux vraies gateways internes, S1 gardant à côté son propre test d'acceptation ; ou l'exemption déclarée (`library`, `refactoring`, `docs-only`) tient et les changements de l'histoire la confirment ; S1 seul est tagué `@walking-skeleton`. | blocker |
| **E1** | `boundary-enforcement` | Le test d'acceptation de chaque scénario, S1 compris, ne pilote que son cas d'usage ; le walking skeleton ne pilote que le vrai point d'entrée. Ni l'un ni l'autre n'appelle ni n'affirme sur un élément interne du domaine, un repository ou une classe d'infrastructure. Construire les vrais collaborateurs du cas d'usage pour les passer à son constructeur, ou l'hôte de test et les conteneurs du walking skeleton, est du câblage, pas un finding. | blocker |
| **E2** | `boundary-enforcement` | Les doublures ne remplacent que des dépendances du bord extérieur, jamais un objet du domaine ni le cas d'usage ; le squelette de DISTILL est le vrai module. | high |

**Contrôle du moteur.** G11 : le moteur lit où le patch ajoute des fichiers de test et rapporte
sous la lentille `testability#layout` (sévérité blocker) un test ajouté hors des emplacements
unitaire et intégration de la stack, et un composant qui gagne des tests sans aucun dans son
emplacement unitaire. Un test ne compte que sous un chemin de tests que le composant configure
(`paths.tests`) ; un chemin de tests qui est lui-même un emplacement compte comme tel
(`tests/unit`, `tests/Orders.UnitTests`). .NET nomme ses emplacements
`<Context>.UnitTest(s)`, `<Context>.Unit.Tests` ou `<Context>.Tests` et
`<Context>.IntegrationTest(s)` ou `<Context>.Integration.Tests` ; Java suit la convention Maven,
sous le `src/test` d'un module une classe `*IT` (Failsafe) est d'intégration et tout autre test
(Surefire `*Test`, Cucumber) unitaire, et accepte aussi les modules `<context>-unit-test(s)` et
`<context>-integration-test(s)` ; toute autre stack `unit/` et `integration/` sous le chemin des tests.

**Le tableau des scénarios.** Après chaque tentative du passage du plan, le moteur lit le tableau `## Scenarios`
du plan de test et ne le refuse (`scenarios`) que s'il ne peut pas le lire : pas de tableau, lignes non
numérotées S1, S2… dans l'ordre, une ligne sans titre, une ligne dont le composant n'est pas dans `skraft-config.json`
([règles et messages](./phases.md#scenarios)). Le tag walking skeleton, l'exemption, les titres en double et le
tableau de groupes sont à juger par les lentilles (G8, G6) ; la couverture des critères d'acceptation (G1) et la forme du
Gherkin (T4) leur reviennent aussi : le moteur ne contrôle ni l'une ni l'autre.

La revue tourne une fois, après le passage : les tests portent le walking skeleton et le test
d'acceptation de chaque scénario (T2, T3). Le moteur ne lance aucun de ces tests : la revue lit les tests, le squelette et le log du lancement
du designer, qui montre chaque test échouant sur son assertion. Les verts de DELIVER ne sont pas
revus par ces lentilles ; la revue DELIVER les lit.

## DELIVER <!-- #deliver -->

DELIVER passe par les exécutions tracées de gates de l'ingénieur logiciel, puis par l'appel `deliver_review` du workflow `review`, dont la lentille `quality-gates` lit ces exécutions.
Les mêmes
lentilles jugent une pull request par `skraft review --pr`.

| ID | Lentille | Critère | Sévérité |
| --- | --- | --- | --- |
| **G7** | `test-integrity` | Aucun test de façade : chaque test peut échouer quand le comportement qu'il nomme casse. | blocker |
| **G9** | `test-integrity` | Aucun test changé pour passer : ni assertion affaiblie, ni test supprimé, ni skip ou focus ajouté, ni valeur d'acceptation qui s'écarte du `.feature`. | blocker |
| **G4** | `architecture-boundaries` | Aucune doublure d'un type Domain ou Application dans un test unitaire. | blocker |
| **G5** | `architecture-boundaries` | Les dépendances pointent vers l'intérieur : Domain → rien, Application → Domain, API et Infrastructure → Application ; sautée pour un composant dont la gate `architecture` a une exécution tracée réussie dans cette tentative. | blocker |
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
| **Q1** | `quality-gates` | Chaque gate d'un composant touché a une ligne de run dans la trace, ou une ligne `absent` avec une raison (jamais pour `test`) ; un démarrage sans run et un run perdu ne sont pas un run. | blocker |
| **Q2** | `quality-gates` | Le dernier run de la gate a réussi : ni tué, ni expiré, sortie 0. | blocker |
| **Q3** | `quality-gates` | Ce run s'est terminé sur le dernier commit du journal des changements. | blocker |
| **Q4** | `quality-gates` | Ce run a démarré sur un arbre propre ; le run `green` de la ligne de commit est la seule exception. | high |

`quality-gates` ne signale rien sur une pull request relue hors d'un run : elle n'a pas de trace.
`mock-fidelity` ne tourne que sur des changements qui touchent des mocks (`when="mock"`),
`contract-fidelity` que sur des changements qui touchent des contrats (`when="contract"`)
([déclencheurs](./workflow-dot.mdx#conditional-lenses)).

Le moteur vérifie aussi, sans identifiant de gate, les commits de chaque tentative
(`commits.checked`) : [Commits](#commits).

## Commits <!-- #commits -->

Le moteur ne lance aucun test pour vérifier un commit : il juge l'historique Git seul, chaque
commit d'une tentative dans son ordre ; un commit refusé le reste tant qu'il ne quitte pas
l'historique. Le brief donne le message exact du rouge et du vert.

| Type | Sorte | Règle |
| --- | --- | --- |
| `test` | rouge | un test en échec d'un composant (`no-component` sinon) |
| `feat`, `fix` | vert | le code qui le fait passer |
| `refactor`, `style`, `perf` | refactor | un changement sous le vert |
| `docs`, `chore`, `build`, `ci`, `revert` | autre | hors TDD : ne change aucun fichier des chemins `src` ou `tests` d'un composant (`outside-tdd`) |
| tout le reste | invalide | `not-conventional` |

Chaque message finit son corps par `Refs: #<issue>` quand l'histoire en a une
(`issue-reference-missing`), ne cite aucune autre issue (`issue-not-in-story`) et n'en ferme
aucune (`issue-closed`).

| Passage | Permis | Refusé |
| --- | --- | --- |
| `distill`, passage du plan | un rouge qui tient le walking skeleton, le test d'acceptation de chaque scénario et le squelette qu'ils appellent, dans les composants que nomment les scénarios, et le `.feature` de ces composants ; aucun pour une histoire exemptée de walking skeleton et de tests ; les fichiers `.feature` et Markdown l'accompagnent ou vont dans un commit `docs`, où qu'ils soient | un second rouge (`oracle-split`) ; un rouge dans un composant qu'aucun scénario ne nomme (`oracle-component`) ; un rouge sans fichier des chemins de test du composant (`oracle-without-test`) ; un vert ou un refactor (`code-in-oracle`) ; aucun |
| `deliver`, passage de l'histoire | un seul vert, pour toute l'histoire, quoi que nomme son sujet, enchaîné : `<commande de test> && git add <fichiers> && git commit …` en sh ou PowerShell 7, `<commande de test>; if ($?) { git add <fichiers>; if ($?) { git commit … } }` en Windows PowerShell 5.1 ; les groupes du plan d'implémentation donnent l'ordre de travail, non un nombre de commits ; un changement d'un autre composant dont un groupe a besoin est accepté et journalisé sous `green.others` | un rouge (`test-in-scenario`) ; un refactor (`refactor-in-scenario`) ; un deuxième vert (`green-split` : le fusionner dans le premier) ; un changement d'un fichier du commit des tests d'acceptation, walking skeleton compris, hors des chemins `src` du composant (`oracle-touched`) ; aucun |
| `deliver` renvoyé par la revue, après le passage de l'histoire | sur toute l'histoire, chaque cycle un vert qui porte son test et son code, une fois qu'il passe ; des refactors | un rouge (`test-apart` : le fusionner dans son vert) ; un vert sans fichier des chemins de tests d'un composant (`green-without-test`) ; un changement d'un fichier du commit des tests d'acceptation (`oracle-touched`) |

Qu'un rouge échoue sur une assertion se lit, ne se rejoue pas : le designer d'acceptation lance une
fois le walking skeleton et les tests d'acceptation par `skraft_repl` avec l'étiquette `red`, le
moteur consigne ce run tracé (`evidence.checked` avec `red`), et la revue DISTILL (T3) comme
l'humain en lisent le log sous `logs/runs/` ([Logs](./run-journal.md#logs)). Que le vert fasse passer l'histoire, c'est la commande qui le commite : enchaînée
par `&&`, elle ne commite que si les tests passent. Un fichier que les tests écrivent dans la copie
de travail (un rapport de test) est un changement comme un autre, tenu au périmètre d'écriture :
listez-le dans `.gitignore`. Une machine qui ne peut pas lancer une commande (programme non
installé, runtime de conteneurs qui ne répond pas) bloque l'agent, et la question `environment`
passe la main à un humain.

Un run d'une alpha V2 antérieure arrêté en DELIVER entre deux groupes, dont le journal tient un
passage par groupe, est refusé à sa reprise avec le code `delivery-shape` et la raison fixe
« this run was started by an engine that delivered one group per pass; start the story again ».

## Revue : réponse, réfutation, verdict <!-- #review-run -->

Ce qui suit vaut pour les revues que le moteur conduit (DESIGN, DISTILL, DELIVER, `skraft review
--pr`).

### Réponse d'une lentille <!-- #lens-answer -->

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
    severityReason: "le montant du remboursement n'est plus vérifié"
    drift: structural    # label | classification | structural
    occurrences:
      - "tests/Orders.UnitTest/RefundTests.cs:42"
```

| Règle | Détail |
| --- | --- |
| Clés | seulement `lens`, `verdict`, `findings` ; par finding `id`, `gate`, `severity`, `location`, `description`, `suggestion`, `severityReason`, `drift`, `occurrences` ; toute autre clé refuse la réponse ; une clé entourée ou suivie de guillemets, d'accents graves ou de parenthèses (`"verdict": fail`, `severityReason"": "…"`) ou écrite comme un appel (`severityReason("…")`) est lue comme la clé qu'elle contient, dans les réponses du réfutateur aussi |
| Obligatoire | `gate`, `description`, `severityReason` (pourquoi cette sévérité), `drift` (`label`, `classification` ou `structural`) et `occurrences` (chaque `chemin:ligne` du même fait, en liste ou sur une ligne séparée par `,` ou `;`) ; un `id` absent devient le premier `F<n>` libre |
| Valeurs | textes libres entre guillemets doubles ou en bloc littéral ; ni ancre, ni alias, ni tag ; casse de `verdict` et `severity` normalisée |
| Plafond | au plus 20 findings ; un `pass` avec un finding blocker, high ou medium est refusé |
| Textes | ramenés sur une ligne et tronqués (description : 500 caractères) ; `location` rendue relative à la copie de travail, séparée par `/`, sans `./`, son `:ligne` gardé (un chemin hors de la copie de travail reste absolu) |
| Réponse refusée | la lentille est relancée une fois avec la raison ; une seconde réponse illisible est un incident imprévu : le run attend sur la question `unforeseen`, sa raison dans `logs/incident-<étape>-<signature>.log` ; une nouvelle tentative ne relance que les lentilles dont la réponse était illisible |

### G9 lu par le moteur <!-- #g9-engine -->

Quand `test-integrity` relit les changements, le moteur lit aussi le patch des
fichiers de test (fichiers source sous un dossier `test`, `tests`, `spec` ou `__tests__`, ou
nommés comme `test_*.py`, `*.test.ts`, `*_test.go`, `*Tests.cs`, `*IT.java` ; fixtures, snapshots
et testdata exclus) et journalise ce qu'il trouve sous la lentille `test-integrity#patch` (agent
`skraft-engine`) : un skip ou un focus ajouté (`[Fact(Skip = …)]`, `[Ignore]`, `.skip`, `.only`,
`.todo`, `xit(`, `fit(`, `@pytest.mark.skip`/`skipif`/`xfail`, `@Disabled`, `t.Skip(`…, blocker à
`chemin:ligne`), un fichier de test supprimé (blocker), des lignes d'assertion retirées avec
moins de lignes ajoutées (high). Le brief de `test-integrity` les liste pour que la lentille ne
les signale pas une seconde fois ; ils partent au réfuteur comme ceux d'une lentille.

### Réfutation <!-- #refutation -->

Les findings de lentilles différentes au même `chemin:ligne` (le chemin normalisé
comme ceux du patch : `./src\Checkout.cs:12` est `src/Checkout.cs:12`) et de même sévérité
forment un groupe. Chaque groupe de findings, de toute sévérité, part une fois chez
`finding-refuter`, son libellé et son brief nommant chaque lentille du groupe, avec les entrées, les
skills et le descripteur de ces lentilles (pour un contrôle du moteur, les skills et le descripteur
de la lentille à laquelle il se rattache). Il juge selon la règle du gate que cite le finding, telle
que la table des gates du descripteur, ces skills et leurs références l'énoncent ; une règle qu'aucune entrée n'énonce n'est pas une raison de réfuter, et
rend le finding `unverifiable`. Il répond `confirmed`, `refuted` (sa `reason` cite le `chemin:ligne`
lu) ou `unverifiable`, et la réponse vaut pour chaque finding du groupe. Un finding réfuté ne
compte pas ; un finding invérifiable compte, comme celui dont la vérification a été illisible
deux fois.

Comment chaque réponse se voit dans une pull request : [Du constat au statut](./pull-request.md#finding-to-status).

### Verdict <!-- #verdict -->

Une lentille qui répond `inconclusive` bloque la revue avec `lens-inconclusive`, en nommant
chacune de ces lentilles et ce qu'elle a noté : le travail n'est pas renvoyé, aucun finding
n'est vérifié, et le run pose la question `blocked` sur le nœud de revue. Sinon `NEEDS_REWORK`
quand un finding compte, sinon `APPROVED`. Tout finding que le réfuteur n'a pas réfuté compte, un
low aussi, que sa lentille ait répondu `fail` ou `pass`, pour que le producteur corrige toutes les
sévérités tant que la revue peut lui renvoyer son travail. À partir de la deuxième passe, un
finding à l'endroit d'un finding que le réfuteur a réfuté est reporté comme réfuté, et un finding
nouveau sur une ligne que le producteur a laissée telle quelle est une note, la seule sorte de
note qu'une revue met de côté : aucun des deux ne compte, ne retourne au producteur ni n'apparaît dans
la question `review-ceiling`. Les findings
retenus vont dans le brief suivant de l'agent de la phase, un groupe sur une ligne qui cite
chacune de ses lentilles. Quand la boucle vers le producteur atteint son `max_visits`, le run
interroge un humain au lieu de renvoyer encore le travail : la question `review-ceiling`
(`ACCEPT`, une consigne ou `STOP`) quand il ne reste que des findings medium et low, la question
`blocked` (une consigne ou `STOP`) tant qu'il en reste un blocker ou high
([Dossier de suivi et journal](./run-journal.md)).
Le résumé donne le statut, puis les findings réfutés et les notes mis de côté, chacun cité
(`APPROVED: no finding counts; 2 refuted (consistency F1, fitness F1); 1 note (coverage F3)`,
`APPROVED: every lens passed` quand aucune lentille n'a rien trouvé) ; la progression (le panneau,
le journal du workflow) liste dessous chaque finding réfuté avec la raison du réfuteur et chaque note, puis
l'emplacement de `verdict.yaml`, pour qu'un humain puisse quand même les faire corriger.

Le tableau que lit un relecteur : [Tableau de revue](./pull-request.md#review-table).

### Re-revue incrémentale <!-- #incremental -->

À une passe suivante, une lentille dont le résultat précédent était
`pass` sans finding, et dont l'empreinte n'a pas changé, n'est pas relancée : son résultat est
journalisé de nouveau avec `reused: true`. L'empreinte couvre ses entrées, le contenu de chaque
`SKILL.md` qu'elle lit (par nom de skill : déplacer la copie de travail ou le plugin n'y change
rien), les fichiers de règles du projet et le contenu de chaque chemin changé qu'elle lit.

À partir de la deuxième passe, la revue compare chaque finding, de toute sévérité, à ceux de
la passe précédente de la même étape, avant d'interroger le réfuteur. Deux findings d'une même
lentille et d'un même gate sont au même endroit quand ils citent le même chemin et que le texte de
leurs lignes apparaît exactement une fois dans ce fichier à chaque passe (une ligne déplacée reste
la même, une ligne modifiée ou répétée non) ; sans ligne, quand leur emplacement et leur constat
sont identiques mot pour mot. Chaque passe garde ce que contenaient les fichiers revus dans
`snapshot.json`, à côté de son verdict.

| Finding de cette passe | Devient |
| --- | --- |
| à l'endroit d'un finding que la passe précédente a réfuté | réfuté, reporté avec cette raison, sans interroger le réfuteur (`review.refuted` avec `carried`) |
| à l'endroit d'un finding que la passe précédente n'a pas réfuté | vérifié par le réfuteur comme d'habitude |
| nouveau, d'une lentille, sur une ligne que la passe précédente a lue avec le même texte | une note : il ne renvoie jamais le travail (`review.noted`) |
| tout autre | vérifié par le réfuteur comme d'habitude |

### Verdict de DISCOVER et DISCUSS <!-- #backlog-verdict -->

`review-verdict.mjs` lit les réponses des lentilles et écrit le fichier de revue ; son code de
sortie porte le verdict.

| Constat | Verdict | Code de sortie |
| --- | --- | --- |
| au moins un finding `blocker`, ou une story avec deux findings G7 ou plus (DISCUSS) | `REJECTED` | 4 |
| sinon, un finding `medium` ou plus, une lentille `fail` ou `inconclusive`, ou un finding sur une gate hors de la phase | `NEEDS_REWORK` | 3 |
| sinon (findings `low` seuls, ou aucun) | `APPROVED` | 0 |
| ligne mal formée ou réponse illisible | — | 1 |

## Voir aussi <!-- #see-also -->

- [Phases](./phases.md)
- [Le workflow DOT](./workflow-dot.mdx)
- [Catalogue des agents et lentilles](pathname:///dashboard/)
- [Lancer les gates](../how-to/run-gates.md)
- [La revue avant la revue](../explanation/deep-dive/review-before-review.md)

Termes à connaître : **gate**, **lentille**, **finding**, **BLOCKER**, **INVEST**, **walking
skeleton** — voir le [glossaire](./glossary.md).
