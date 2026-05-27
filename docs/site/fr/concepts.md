---
layout: default
lang: fr
title: "Concepts fondamentaux"
persona: tech-lead
---

# Concepts fondamentaux

SKRAFT repose sur six concepts issus de l'ingénierie logicielle. Chaque concept est appliqué concrètement dans le pipeline — ce ne sont pas des idéaux théoriques, mais des contraintes opérationnelles.

## Use Case

Un Use Case capture un contrat entre les parties prenantes sur le comportement attendu du système. Dans SKRAFT, **une story = un Use Case = un cycle complet du pipeline** (DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER).

> « A use case captures a contract between the stakeholders of a system about its behavior. »
> — Cockburn, A., *Writing Effective Use Cases*, 2001.

Chaque passage dans le pipeline traite exactement un Use Case. Pas de batching, pas de raccourcis.

## CQS — Command-Query Separation

CQS sépare les opérations qui modifient l'état (commandes) de celles qui le consultent (queries). Dans SKRAFT, les agents exécuteurs commandent (ils écrivent des artefacts), tandis que les agents reviewers querient (ils lisent les artefacts sans les modifier).

> « Asking a question should not change the answer. »
> — Meyer, B., *Object-Oriented Software Construction, 2nd ed.*, 1997.

Voir [Architecture](/fr/architecture) pour l'application de CQS dans le pipeline.

## CQRS — Command-Query Responsibility Segregation

CQRS étend CQS en séparant les modèles de lecture et d'écriture. L'orchestrateur dispatche des commandes vers les exécuteurs (modèle d'écriture), puis consulte `state.json` comme modèle de lecture dérivé pour décider de la prochaine action.

> « Use different models for updating information and reading information. »
> — Fowler, M., *Bliki: CQRS*, 2011.

Pour un traitement approfondi de CQRS dans le contexte DDD, voir Vernon, *Implementing Domain-Driven Design*, 2013.

## Walking Skeleton

Un Walking Skeleton est la tranche la plus fine qui traverse toutes les couches du système de bout en bout. La première itération de SKRAFT sur un projet livre une tranche fonctionnelle complète — pas un prototype, un vrai livrable vertical.

> « A walking skeleton is a tiny implementation of the system that performs a small end-to-end function. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

Le pipeline DELIVER implémente chaque story comme un Walking Skeleton avant d'enrichir les détails.

## Mutation Testing

Le Mutation Score mesure l'efficacité de la suite de tests, pas simplement la couverture de code. Le testing par mutation injecte des défauts dans le code et vérifie que les tests les détectent.

> « Mutation testing provides high-fidelity assessment of test suite effectiveness. »
> — Jia, Y. & Harman, M., *An Analysis and Survey of the Development of Mutation Testing*, 2011.

Dans la phase DELIVER, le Mutation Score sert de garde-fou qualité : un score insuffisant bloque le verdict PASS du reviewer.

## Object Calisthenics

Les Object Calisthenics sont neuf règles de discipline qui améliorent le design objet au quotidien. Ce ne sont pas des règles d'architecture mais des contraintes d'atelier — elles s'appliquent au code produit par le software-engineer.

> « Nine steps to better software design today. »
> — Bay, J., *Object Calisthenics*, 2008.

Ces règles encadrent le code produit en phase DELIVER et sont vérifiées par le software-engineer-reviewer.
