---
layout: default
lang: fr
title: "Clean Architecture — Détails"
persona: tech-lead
---

# Clean Architecture

La Clean Architecture, popularisée par Robert C. Martin (Uncle Bob), est au cœur de l'approche SKRAFT lors des phases DESIGN et DELIVER. Elle garantit que le cœur métier de l'application est indépendant des frameworks, des interfaces utilisateur, et des bases de données.

## Objectif

L'objectif principal est de réduire la charge cognitive et de s'assurer que l'infrastructure et la logique de livraison sont de simples détails d'implémentation (des "plugins" au sens architectural).

## Les 4 Couches Principales

1. **Entities (Enterprise Business Rules)**
   Les entités encapsulent les règles métier de l'entreprise. Ce sont les objets métiers fondamentaux (par exemple, dans notre contexte SKRAFT, une `Story` ou un `Agent`).
   
2. **Use Cases (Application Business Rules)**
   Les cas d'utilisation orchestrent le flux de données vers et depuis les entités. Ils implémentent la logique applicative spécifique (ex: `PlanStoryUseCase`).
   
3. **Interface Adapters**
   Cette couche convertit les données du format le plus pratique pour les Use Cases vers le format le plus pratique pour les agents externes tels que le Web ou la base de données. On y trouve les Controllers, Presenters, et Gateways.
   
4. **Frameworks and Drivers**
   La couche la plus externe, composée des frameworks web, bases de données, etc. C'est ici que vit le code technique.

## La Règle de Dépendance

> **Le code source ne peut dépendre que de ce qui se trouve à l'intérieur.**

Rien dans un cercle interne ne peut connaître quoi que ce soit d'un cercle externe. Par exemple, un Use Case ne doit jamais importer un objet du contrôleur web.

## Dans le cycle SKRAFT

- Lors de la phase **DESIGN**, le `solution-architect` définit les interfaces et les boundaries de cette architecture.
- L'approche Outside-In TDD dans la phase **DELIVER** force l'équipe à définir d'abord le comportement externe (Acceptance tests) avant d'implémenter les couches internes, garantissant ainsi le respect strict de la Clean Architecture.

Ce paradigme, bien que nécessitant un investissement initial plus lourd, apporte une maintenabilité et une testabilité incomparables sur le long terme.
