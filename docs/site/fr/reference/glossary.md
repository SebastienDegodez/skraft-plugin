---
layout: doc
lang: fr
title: "Glossaire"
description: "Chaque terme du craft expliqué simplement : TDD, mutation testing, Object Calisthenics, gate, lentille, et plus."
---

# Glossaire

> Un mot que vous ne comprenez pas ne devrait pas bloquer votre lecture. Ce glossaire explique chaque terme technique en langage courant, sans supposer de formation en software craftsmanship.

## A

**ADR (Architecture Decision Record)**
Un document court qui enregistre une décision d'architecture : le contexte, les options considérées, la décision retenue et les raisons. Sert de mémoire du projet.
→ Voir [Patterns]({{ "/fr/reference/patterns" | relative_url }})

**Agent**
Dans SKRAFT, un programme IA spécialisé qui joue un rôle précis dans le pipeline (ex : `backlog-discoverer`, `solution-architect`). Un agent *exécuteur* produit des artefacts ; un agent *reviewer* émet des verdicts.
→ Voir [Agents]({{ "/fr/reference/agents/" | relative_url }})

**Artefact**
Tout fichier produit par le pipeline : stories raffinées, ADR, scénarios BDD, code, rapports de tests. Les artefacts constituent la trace auditable du travail.

## B

**BDD (Behaviour-Driven Development)**
Méthode de développement où les comportements attendus sont décrits en langage naturel structuré (Gherkin : *Given / When / Then*) avant d'écrire le code. Permet aux non-développeurs de comprendre et valider les tests.

**Backlog**
Liste priorisée de fonctionnalités ou User Stories à développer. Le backlog est la "liste de courses" du projet.

## C

**Clean Architecture**
Style d'architecture logicielle qui sépare les règles métier des détails techniques (bases de données, frameworks, interfaces). Proposé par Robert C. Martin.
→ Voir [Patterns]({{ "/fr/reference/patterns" | relative_url }})

**CQRS (Command Query Responsibility Segregation)**
Principe qui sépare les opérations d'écriture (commandes) des opérations de lecture (requêtes) dans une application.

**CQS (Command-Query Separation)**
Principe de conception : une méthode soit modifie l'état (commande), soit retourne une valeur (requête), jamais les deux. Dans SKRAFT, les reviewers sont en lecture seule (ils sont des requêtes, pas des commandes).

**Craft (software craftsmanship)**
Approche du développement logiciel qui met l'accent sur la qualité, les bonnes pratiques et le professionnalisme. Un artisan logiciel écrit du code lisible, testé et maintenable.

## D

**DDD (Domain-Driven Design)**
Approche de conception centrée sur le domaine métier. Le code reflète le vocabulaire et les concepts du métier (*langage ubiquitaire*). Proposé par Eric Evans.
→ Voir [Patterns]({{ "/fr/reference/patterns" | relative_url }})

## E

**Event Modeling**
Technique de spécification qui décrit un système comme une séquence d'événements dans le temps. Facilite la communication entre équipes techniques et métier.

**Event Sourcing**
Patron d'architecture où l'état d'un système est reconstruit à partir d'une séquence d'événements immuables, plutôt que d'un état courant dans une base de données.

## G

**Gate (porte de qualité)**
Point de contrôle entre deux phases du pipeline SKRAFT. Un gate définit des critères précis à remplir pour progresser. Si les critères ne sont pas atteints, la phase recommence.
→ Voir [Gates]({{ "/fr/reference/gates" | relative_url }})

**Gherkin**
Langage structuré pour écrire des scénarios BDD : `Given` (contexte), `When` (action), `Then` (résultat attendu).

## L

**Langage ubiquitaire**
Vocabulaire partagé entre développeurs et experts métier, utilisé aussi bien dans les conversations que dans le code. Concept central du DDD.

**Lentille (reviewer lens)**
Dans SKRAFT, un point de vue spécialisé appliqué lors de la revue adverse. Les 4 lentilles sont : `architecture-boundaries`, `cold-reader`, `quality-gates`, `test-integrity`.
→ Voir [Lentilles]({{ "/fr/reference/lens" | relative_url }})

## M

**Mutation testing**
Technique qui modifie légèrement le code source (introduit des "mutants") pour vérifier que les tests les détectent. Un test qui ne détecte pas un mutant est un test faible.

## O

**Object Calisthenics**
Ensemble de 9 règles de conception appliquées au code orienté objet pour forcer la qualité structurelle. Exemple : une seule indentation par méthode, pas de getter/setter.

**Outside-In TDD**
Variante du TDD où les tests commencent au niveau le plus externe (comportement observable) et descendent vers les détails internes. Aussi appelé "London School TDD".
→ Voir [Skills]({{ "/fr/reference/skills/" | relative_url }})

## P

**Pattern (patron d'architecture)**
Solution éprouvée à un problème récurrent. Les patterns SKRAFT (DDD, Clean Architecture, CQRS...) sont documentés avec leur référence d'origine.
→ Voir [Patterns]({{ "/fr/reference/patterns" | relative_url }})

**Pipeline**
Flux d'artefacts SKRAFT : DISCOVER puis DISCUSS sont deux workflows produit autonomes et optionnels. `skraft-orchestrator` séquence ensuite RESEARCH → DESIGN → DISTILL → DELIVER à partir d'une story affinée.
→ Voir [Le pipeline]({{ "/fr/explanation/pipeline/" | relative_url }})

## R

**Reviewer**
Agent IA en lecture seule qui émet un verdict (`APPROVE`, `CONDITIONAL_APPROVE`, `REJECT`) sur les artefacts produits par un agent exécuteur. Un reviewer ne modifie jamais les artefacts (principe CQS).

**Rework**
Travail à refaire parce qu'il n'a pas passé la revue. SKRAFT vise à réduire le rework en filtrant les défauts tôt dans le pipeline.

## S

**Skill**
Dans SKRAFT, une pratique outillée encapsulée dans un fichier `SKILL.md`. Une skill définit quoi faire, comment le faire et quelles références la justifient.
→ Voir [Skills]({{ "/fr/reference/skills/" | relative_url }})

**State.json**
Fichier de traçabilité produit par le pipeline SKRAFT. Il contient l'historique des phases, artefacts et verdicts pour une User Story.

## T

**TDD (Test-Driven Development)**
Méthode où les tests sont écrits *avant* le code. Cycle : Red (test qui échoue) → Green (code minimal) → Refactor (amélioration).

**TTM (Time-to-Market)**
Délai entre la définition d'une fonctionnalité et sa disponibilité en production. Indicateur clé pour les décideurs.
→ Voir [Pour les décideurs]({{ "/fr/explanation/for-executives" | relative_url }})

## U

**Use Case (cas d'utilisation)**
Description d'une interaction entre un acteur et le système pour atteindre un objectif. Dans SKRAFT, chaque passage dans le pipeline traite exactement un Use Case.

**User Story**
Description courte d'une fonctionnalité du point de vue de l'utilisateur : "En tant que [rôle], je veux [action] afin de [bénéfice]."

## V

**Verdict**
Résultat d'une revue par un reviewer : `APPROVE` (validé), `CONDITIONAL_APPROVE` (validé sous conditions), `REJECT` (à corriger). Un `REJECT` déclenche une correction et une nouvelle revue.

## W

**Walking Skeleton**
Première itération d'un projet qui traverse toutes les couches de l'architecture de bout en bout avec une fonctionnalité minimale. Valide l'architecture avant de construire les détails.

## Sources

Les termes de ce glossaire sont définis d'après leurs ouvrages de référence :

- Evans, E. *Domain-Driven Design*, 2003 — DDD, Ubiquitous Language.
- Martin, R. C. *Clean Architecture*, 2017 — Clean Architecture, CQS.
- Beck, K. *Test-Driven Development by Example*, 2003 — TDD.
- Freeman, S. & Pryce, N. *Growing Object-Oriented Software, Guided by Tests*, 2009 — Outside-In TDD, Walking Skeleton.
- Wiegers, K. *Peer Reviews in Software*, 2002 — revue, gate.

La bibliographie complète est sur la page [Citations]({{ "/fr/reference/citations" | relative_url }}).
