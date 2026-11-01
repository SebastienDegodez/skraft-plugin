---
title: "Glossaire"
description: "Chaque terme du craft expliqué simplement : TDD, mutation testing, Object Calisthenics, gate, lentille, et plus."
---

# Glossaire

Un mot que vous ne comprenez pas ne devrait pas bloquer votre lecture. Ce glossaire explique chaque terme technique en langage courant, sans supposer de formation en software craftsmanship.

## A

**ADR (Architecture Decision Record)**
Un document court qui enregistre une décision d'architecture : le contexte, les options considérées, la décision retenue et les raisons. Sert de mémoire du projet.
→ Voir [Patterns](./patterns.md)

**Agent**
Dans SKRAFT, un programme IA spécialisé qui joue un rôle précis dans le pipeline (ex : `backlog-discoverer`, `solution-architect`). Un agent *exécuteur* produit des artefacts ; un agent *reviewer* émet des verdicts.
→ Voir [Agents](pathname:///dashboard/)

**Artefact**
Tout fichier produit par le pipeline : stories raffinées, ADR, scénarios BDD, code, rapports de tests. Les artefacts constituent la trace auditable du travail.

## B

**Base**
Point de comparaison d'un dépôt : `git merge-base HEAD <ref>`, avec `main` par défaut. Elle décide quels composants ont changé et remplace `{baseSha}` dans les commandes. Journalisée au démarrage du run.
→ Voir [Base](./skraft-config.md)

**Barre qualité**
Les seuils que le skill `skraft-quality-bar` fixe pour tous les dépôts : 100 % de score de mutation et de couverture de lignes sur Domain et Application, 80 % de score de mutation sur API et Infrastructure. Aucune configuration ne les abaisse.
→ Voir [Software craftsmanship](../explanation/software-craftsmanship.md)

**BDD (Behaviour-Driven Development)**
Méthode de développement où les comportements attendus sont décrits en langage naturel structuré (Gherkin : *Given / When / Then*) avant d'écrire le code. Permet aux non-développeurs de comprendre et valider les tests.

**Backlog**
Liste priorisée de fonctionnalités ou User Stories à développer. Le backlog est la "liste de courses" du projet.

## C

**Classe d'échec**
Nature d'une gate en échec : `environment` (la machine ou la config doit changer : programme absent, programme arrêté) ou `deterministic` (la commande a échoué : le code doit changer).
→ Voir [Classe d'échec](../how-to/run-gates.md)

**Composant**
Un projet du dépôt (ou d'un dépôt voisin) décrit dans `skraft-config.json` : racine, stack, commandes. Les gates tournent par composant.
→ Voir [Composant](./skraft-config.md)

**Clean Architecture**
Style d'architecture logicielle qui sépare les règles métier des détails techniques (bases de données, frameworks, interfaces). Proposé par Robert C. Martin.
→ Voir [Patterns](./patterns.md)

**Contract testing**
Vérifier qu'un fournisseur d'API respecte le contrat que ses consommateurs attendent, sans test de bout en bout. Activé par composant dans `skraft-config.json`.
→ Voir [Contract testing](../explanation/deep-dive/contract-testing.md)

**CQRS (Command Query Responsibility Segregation)**
Principe qui sépare les opérations d'écriture (commandes) des opérations de lecture (requêtes) dans une application.

**CQS (Command-Query Separation)**
Principe de conception : une méthode soit modifie l'état (commande), soit retourne une valeur (requête), jamais les deux. Dans SKRAFT, les reviewers sont en lecture seule (ils sont des requêtes, pas des commandes).

**Craft (software craftsmanship)**
Approche du développement logiciel qui met l'accent sur la qualité, les bonnes pratiques et le professionnalisme. Un artisan logiciel écrit du code lisible, testé et maintenable.

## D

**DDD (Domain-Driven Design)**
Approche de conception centrée sur le domaine métier. Le code reflète le vocabulaire et les concepts du métier (*langage ubiquitaire*). Proposé par Eric Evans.
→ Voir [Patterns](./patterns.md)

**Dissent Rule**
Règle de revue : quand une seule lentille trouve ce qui renverrait le travail et que les autres ont passé, `finding-refuter` juge ses findings avec toutes les entrées de la revue avant qu'ils comptent.
→ Voir [La revue avant la revue](../explanation/deep-dive/review-before-review.md)

**DoR (Definition of Ready)**
Grille de huit points qu'une story doit passer avant d'entrer en ingénierie : problème, persona précis, exemples du domaine, scénarios, critères dérivés des exemples, taille, notes techniques, dépendances.
→ Voir [Le backlog](../explanation/backlog.md)

## E

**Event Modeling**
Technique de spécification qui décrit un système comme une séquence d'événements dans le temps. Facilite la communication entre équipes techniques et métier.

**Event Sourcing**
Patron d'architecture où l'état d'un système est reconstruit à partir d'une séquence d'événements immuables, plutôt que d'un état courant dans une base de données.

## F

**Finding**
Un défaut qu'une lentille signale : la gate concernée, une sévérité (`blocker`, `high`, `medium`, `low`), un emplacement et une description. Seuls les findings `blocker`, `high` et `medium` qui tiennent renvoient le travail.
→ Voir [Gates](./gates.md#lens-answer)

## G

**Gate (porte de qualité)**
Une commande nommée d'un composant (`build`, `format`, `lint`, `test`, `architecture`, `coverage`, `mutation`) que le moteur lance lui-même pour prouver la qualité. Chaque gate laisse un fichier de preuve et un événement `gate.ran`. Le moteur les lance en DELIVER (les nœuds verrouillés `gates` et `mutation`) ; `skraft gate` les lance à la main.
→ Voir [skraft-config.json](./skraft-config.md) ; les critères de revue des lentilles : [Gates](./gates.md)

**Gherkin**
Langage structuré pour écrire des scénarios BDD : `Given` (contexte), `When` (action), `Then` (résultat attendu).

## H

**HVE Core**
Le socle d'agents, d'instructions et de skills pour GitHub Copilot publié par Microsoft (`microsoft/hve-core`), sur lequel SKRAFT a été construit. SKRAFT en garde le dossier de suivi `.copilot-tracking/`.
→ Voir [Le journal d'événements](../explanation/event-journal.md)

## I

**INVEST**
Les six qualités d'une bonne story : indépendante, négociable, porteuse de valeur, estimable, petite, testable (Wake, 2003).
→ Voir [Le backlog](../explanation/backlog.md)

## J

**Journal (events.jsonl)**
Fichier du dossier de suivi où le moteur écrit un événement par ligne, chaque ligne portant le hachage de la précédente. L'état du run est recalculé depuis lui ; une modification à la main est détectée.
→ Voir [Journal (events.jsonl)](./run-journal.md)

## L

**Langage ubiquitaire**
Vocabulaire partagé entre développeurs et experts métier, utilisé aussi bien dans les conversations que dans le code. Concept central du DDD.

**Lentille (reviewer lens)**
Dans SKRAFT, un point de vue spécialisé de la revue adverse, porté par un agent isolé en lecture seule `<nom>-lens`. Le pilote d'hôte lance les lentilles d'un nœud de revue et le moteur calcule le verdict à partir de leurs findings. Lentilles livrées avec le plugin : DESIGN `consistency`, `architecture-compliance`, `fitness` ; DISTILL `coverage`, `business-alignment`, `testability`, `boundary-enforcement` ; DELIVER `test-integrity`, `architecture-boundaries`, `cold-reader`, `mock-fidelity`, `contract-fidelity` (`quality-gates` est retirée en V2 : le moteur lance les gates lui-même).
→ Voir [Lentilles](pathname:///dashboard/)

## M

**Microcks**
Outil qui simule les API dont dépend un composant, à partir de leurs contrats ; il tourne dans un conteneur, Docker ou Podman. C'est le mocking par défaut d'un composant (`"mocking": { "strategy": "microcks" }`) : les tests qui l'utilisent exigent alors que Docker ou Podman tourne. `inprocess` s'en passe.
→ Voir [Microcks](./skraft-config.md)

**MoSCoW**
Priorisation en *Must*, *Should*, *Could*, *Won't* utilisée par le triage et la carte des stories.

**Moteur**
Le code de SKRAFT qui décide de chaque étape du pipeline (ordre, sorties attendues, relances, gates), le même sur tous les hôtes.
→ Voir [Moteur](../explanation/architecture.md)

**Mutant survivant**
Une modification du code que les tests n'attrapent pas. Il finit de l'une de trois façons : un test qui le tue, le code supprimé, ou le mutant déclaré équivalent. En DELIVER, l'agent le propose et le développeur choisit (question `mutation-plan`).
→ Voir [DELIVER](../explanation/pipeline/deliver.mdx)

**Mutation testing**
Technique qui modifie légèrement le code source (introduit des "mutants") pour vérifier que les tests les détectent. Un test qui ne détecte pas un mutant est un test faible.

## N

**Nœud question**
Un nœud du workflow de forme `hexagon` qui pose une question à un humain (`question="adr-ratification"`). Ses arêtes sortantes portent les réponses en label ; un refus (`REJECTED`) ramène au nœud dont il refuse le travail.
→ Voir [Répondre à une question du run](../how-to/answer-a-question.mdx)

## O

**Object Calisthenics**
Ensemble de 9 règles de conception appliquées au code orienté objet pour forcer la qualité structurelle. Exemple : une seule indentation par méthode, pas de getter/setter.

**Outside-In TDD**
Variante du TDD où les tests commencent au niveau le plus externe (comportement observable) et descendent vers les détails internes. Aussi appelé "London School TDD".
→ Voir [Skills](pathname:///dashboard/)

## P

**Pilote d'hôte**
La partie de SKRAFT propre à un hôte (mod Claude Code, workflow Copilot CLI, SDK Copilot sous VS Code, boucle d'agent `skraft next` / `skraft record`) qui lance les agents et pose les questions que le moteur demande, sans rien décider.
→ Voir [Pilote d'hôte](../explanation/architecture.md)

**Pattern (patron d'architecture)**
Solution éprouvée à un problème récurrent. Les patterns SKRAFT (DDD, Clean Architecture, CQRS...) sont documentés avec leur référence d'origine.
→ Voir [Patterns](./patterns.md)

**Pipeline**
Les quatre phases RESEARCH → DESIGN → DISTILL → DELIVER qu'une story traverse. Le moteur décide de chaque étape et un pilote d'hôte lance les agents. DISCOVER et DISCUSS restent des workflows produit optionnels, en amont.
→ Voir [Le pipeline](../explanation/pipeline/index.mdx)

**Pipeline actif**
Le slug écrit dans `.copilot-tracking/skraft-plans/.active-slug` : le run sur lequel agissent `skraft status`, `skraft gate` et la reprise. Un par copie de travail (donc par worktree) ; il ne change que par un init explicite, jamais deviné.
→ Voir [Pipeline actif](./run-journal.md)

## Q

**Question d'environnement**
La question que le moteur pose quand la machine ne peut pas exécuter une étape (programme introuvable, Git en échec) : `Fix it, then RETRY; or ABORT the run.` `RETRY` revérifie ou relance la même étape ; `ABORT` bloque le run.
→ Voir [Reprendre ou débloquer un run](../how-to/resume-a-run.mdx)

## R

**Ratification (d'ADR)**
L'acceptation par un humain des ADR proposés par DESIGN. Seul le moteur passe un ADR en `Accepted`, après une réponse humaine `RATIFIED` ; `REJECTED` renvoie DESIGN avec la raison.
→ Voir [Dossier de suivi et journal](./run-journal.md)

**Réfuteur (`finding-refuter`)**
L'agent qui vérifie un finding `blocker`, `high` ou `medium` en relisant l'endroit cité : `confirmed`, `refuted` (avec la ligne lue) ou `unverifiable`. Un finding réfuté ne compte pas.
→ Voir [Gates](./gates.md#refutation)

**Reviewer**
Agent IA en lecture seule qui juge les artefacts d'un agent exécuteur, sans jamais les modifier (principe CQS). En V2, les reviewers de phase laissent la place à des lentilles isolées dont le moteur combine les findings en verdict.

**Rework**
Travail à refaire parce qu'il n'a pas passé la revue. SKRAFT vise à réduire le rework en filtrant les défauts tôt dans le pipeline.

**Run en attente (waiting)**
Le statut d'un run dont la question n'a pas encore de réponse. Le run ne fait plus rien (fail closed) tant qu'un humain n'a pas répondu par `skraft decide`, `/skraft decide` ou `skraft_decide` ; le relancer repose la même question.
→ Voir [Reprendre ou débloquer un run](../how-to/resume-a-run.mdx)

## S

**Skill**
Dans SKRAFT, une pratique outillée encapsulée dans un fichier `SKILL.md`. Une skill définit quoi faire, comment le faire et quelles références la justifient.
→ Voir [Skills](pathname:///dashboard/)

**Slug**
Le nom kebab-case d'un pipeline (`checkout-by-card`), choisi par le développeur. Un slug = un pipeline = un dossier `.copilot-tracking/skraft-plans/<slug>/`. Ni le moteur ni un agent ne le choisissent.
→ Voir [Slug](./run-journal.md)

**State.json**
Fichier d'état de la v1 (`.copilot-tracking/skraft-plans/<slug>/state.json`), réécrit à chaque transition. En V2, il est remplacé par le journal `events.jsonl` ; `skraft migrate` convertit un `state.json` en cours en journal.
→ Voir [Journal (events.jsonl)](./run-journal.md)

## T

**TDD (Test-Driven Development)**
Méthode où les tests sont écrits *avant* le code. Cycle : Red (test qui échoue) → Green (code minimal) → Refactor (amélioration).

**Triage**
Classer une issue — type, priorité, effort en points — et repérer ses doublons, avant de choisir ce qui entre dans un sprint.
→ Voir [DISCOVER](../explanation/pipeline/discover.md)

**TTM (Time-to-Market)**
Délai entre la définition d'une fonctionnalité et sa disponibilité en production. Indicateur clé pour les décideurs.
→ Voir [Pour les décideurs](../explanation/for-executives.md)

## U

**Use Case (cas d'utilisation)**
Description d'une interaction entre un acteur et le système pour atteindre un objectif. Dans SKRAFT, chaque passage dans le pipeline traite exactement un Use Case.

**User Story**
Description courte d'une fonctionnalité du point de vue de l'utilisateur : "En tant que [rôle], je veux [action] afin de [bénéfice]."

## V

**Verdict**
Résultat d'une revue. En V2, le moteur le calcule à partir des findings typés des lentilles : `APPROVED` ou `NEEDS_REWORK` (relance de l'agent avec les findings). Un `NEEDS_REWORK` sur un nœud de revue sans arête `NEEDS_REWORK` arrête le run avec le code `review-rejected`. La v1 utilisait `APPROVE`, `CONDITIONAL_APPROVE` et `REJECT`.

## W

**Walking Skeleton**
Première itération d'un projet qui traverse toutes les couches de l'architecture de bout en bout avec une fonctionnalité minimale. Valide l'architecture avant de construire les détails.

## Sources

Les termes de ce glossaire sont définis d'après leurs ouvrages de référence :

- Evans, E. *Domain-Driven Design*, 2003 — DDD, Ubiquitous Language.
- Martin, R. C. *Clean Architecture*, 2017 — Clean Architecture, CQS.
- Beck, K. *Test-Driven Development by Example*, 2003 — TDD.
- Freeman, S. & Pryce, N. *Growing Object-Oriented Software, Guided by Tests*, 2009 — Outside-In TDD, Walking Skeleton.
- Wiegers, K. *Peer Reviews in Software*, 2002 — revue.
- Jia, Y. & Harman, M. *An Analysis and Survey of the Development of Mutation Testing*, 2011 — mutation testing.
- Wake, B. *INVEST in Good Stories, and SMART Tasks*, 2003 — INVEST.

La bibliographie complète est sur la page [Citations](./citations.mdx).

## Voir aussi <!-- #see-also -->

- [Bibliographie](./citations.mdx)
- [Patterns d'architecture](./patterns.md)
- [Gates](./gates.md)
- [Software craftsmanship — pourquoi skraft en fait une règle](../explanation/software-craftsmanship.md)
