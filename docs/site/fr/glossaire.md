---
layout: doc
lang: fr
title: "Glossaire"
description: "Glossaire global SKRAFT : chaque terme du craft expliqué simplement — TDD, mutation testing, Object Calisthenics, gate, lentille..."
---

> 🚧 GENERATED DRAFT — to be reviewed and completed by a human.

# Glossaire

> Tous les termes techniques utilisés dans SKRAFT, expliqués sans supposer de maîtrise du software craftsmanship. Chaque définition indique où le terme est utilisé dans le pipeline.

## A

**ADR** (Architecture Decision Record)
: Un document court qui enregistre une décision d'architecture : le contexte, les options considérées, la décision prise et pourquoi. Produit pendant la phase DESIGN. Permet de comprendre *pourquoi* le code est écrit ainsi, pas seulement *comment*.

**Agent**
: Dans SKRAFT, un agent est un programme IA spécialisé qui joue un rôle précis dans le pipeline (exécuteur ou reviewer). Chaque agent a un contrat clair : ce qu'il reçoit, ce qu'il produit.

## B

**BDD** (Behaviour-Driven Development — Développement guidé par le comportement)
: Technique qui consiste à écrire les scénarios d'utilisation d'un logiciel *avant* de coder, dans un langage compréhensible par tout le monde (Gherkin : `Given / When / Then`). Produit pendant la phase DISCUSS.

## C

**CQS** (Command-Query Separation — Séparation commande/requête)
: Principe de design : une fonction fait soit une action (commande, modifie l'état) soit une question (requête, lit l'état), jamais les deux. Les reviewers SKRAFT respectent CQS : ils lisent mais ne modifient jamais.

**CQRS** (Command-Query Responsibility Segregation)
: Extension de CQS au niveau architectural : les flux d'écriture et de lecture sont gérés par des composants séparés.

## D

**DDD** (Domain-Driven Design — Conception orientée domaine)
: Approche de développement logiciel qui place le *domaine métier* au centre. Le code reflète le vocabulaire et les règles du métier. Référence : Evans, E., *Domain-Driven Design*, 2003.

## E

**Event Modeling**
: Technique de modélisation qui représente un système comme une séquence d'événements dans le temps. Utilisée pendant la phase DISCOVER pour aligner tout le monde sur ce qui se passe dans le système.

**Event Sourcing**
: Patron d'architecture où l'état du système est reconstruit à partir d'une séquence d'événements historiques, plutôt que stocké directement.

## G

**Gate (Gxx)**
: Un point de contrôle dans le pipeline SKRAFT. Chaque phase a ses gates : si un gate échoue, l'artefact est rejeté et le cycle recommence. *Gxx* désigne un gate numéroté (G01, G02...).

**Gherkin**
: Langage de description de scénarios BDD, lisible par des non-développeurs. Structure : `Given` (contexte) / `When` (action) / `Then` (résultat attendu).

## L

**Lentille (Lens)**
: Dans SKRAFT, une lentille est un point de vue spécialisé qu'applique le reviewer. Il y en a quatre : architecture-boundaries, cold-reader, quality-gates, test-integrity.

## M

**Mutation Testing**
: Technique qui évalue la qualité des tests en introduisant volontairement des erreurs (*mutations*) dans le code et en vérifiant que les tests les détectent. Un test qui ne détecte pas les mutations ne prouve rien. Référence : Jia & Harman, 2011.

## O

**Object Calisthenics**
: Ensemble de 9 règles de design appliquées au code métier pour forcer une qualité structurelle élevée (pas de `else`, un seul niveau d'indentation, etc.). Référence : Bay, J., 2008.

**Outside-In TDD**
: Variante du TDD (*Test-Driven Development*) qui commence par les tests du comportement observable (interface extérieure) et descend vers les détails internes. Référence : Freeman & Pryce, *Growing Object-Oriented Software, Guided by Tests*, 2009.

## P

**Pipeline SKRAFT**
: La séquence des 5 phases DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER, avec un reviewer par phase et des gates de contrôle.

## R

**Reviewer**
: Agent IA en lecture seule dont le rôle est de valider ou rejeter l'artefact produit par l'exécuteur de la même phase. Ne modifie jamais l'artefact (principe CQS).

**RPI** (Request → Plan → Implement)
: Le workflow de base de HVE. SKRAFT le prolonge en ajoutant 4 autres phases.

**Rework**
: Travail refait parce qu'un problème a été détecté trop tard. SKRAFT réduit le rework en détectant les problèmes tôt, à chaque phase.

## S

**state.json**
: Fichier de trace produit et mis à jour par le pipeline SKRAFT. Contient l'état courant de la story : phase, artefacts produits, verdicts, historique des cycles.

## T

**TDD** (Test-Driven Development — Développement guidé par les tests)
: Technique qui consiste à écrire le test *avant* le code. Cycle : Red (test qui échoue) → Green (code minimal pour passer) → Refactor (améliorer sans casser).

**TTM** (Time To Market)
: Le temps entre l'idée et la mise en production. L'un des indicateurs clés que SKRAFT cherche à réduire.

## U

**Use Case**
: Scénario d'utilisation d'un système par un utilisateur. Dans SKRAFT, chaque passage dans le pipeline traite exactement un Use Case (une *user story*).

**User Story**
: Description courte d'une fonctionnalité du point de vue de l'utilisateur : `En tant que <qui>, je veux <quoi> pour <pourquoi>`.

## W

**Walking Skeleton**
: Implémentation minimale qui traverse toutes les couches du système de bout en bout — sans fonctionnalité complète, juste pour valider que l'architecture fonctionne. Référence : Freeman & Pryce, 2009.

---

> 🚧 Ce glossaire est un brouillon. Un humain doit vérifier les définitions, compléter les termes manquants et valider les références.

*Page générée automatiquement.*
