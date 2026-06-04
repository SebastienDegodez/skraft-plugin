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

SKRAFT nomme ses couches **Domain → Application → Infrastructure → API**, du cœur métier vers le monde extérieur. C'est le vocabulaire utilisé par le skill `clean-architecture-testing` pour décider quoi tester et à quel niveau.

1. **Domain**
   Le cœur métier : entités, *value objects*, *domain events*, *policies* et *specifications*. Il encapsule les règles métier fondamentales (par exemple, dans notre contexte SKRAFT, une `Story` ou un `Agent`) et ne dépend d'**aucune** autre couche.

2. **Application**
   Orchestre les cas d'usage via des *command/query handlers* (ex : `PlaceOrderCommandHandler`). Cette couche pilote le Domain et exprime ses besoins externes sous forme de **ports de sortie** (interfaces de repository, de dispatcher, de service externe) sans connaître leur implémentation.

3. **Infrastructure**
   Les *adapters* concrets qui implémentent les ports de l'Application : repositories, brokers de messages, clients de services externes. C'est ici que vit l'I/O réel (base de données, réseau).

4. **API**
   Le point d'entrée externe : *endpoints* HTTP et composition de l'application (*app host*). Elle traduit les requêtes externes en commandes/requêtes Application.

> Deux couches transverses complètent le tableau : un **SharedKernel** optionnel (interfaces et classes de base, sans logique) et une couche **Architecture** — des tests statiques qui vérifient, en gate CI, que la règle de dépendance n'est jamais violée.

## La Règle de Dépendance

> **Le code source ne peut dépendre que de ce qui se trouve à l'intérieur.**

Les dépendances pointent toujours vers le centre : `API → Application → Domain` et `Infrastructure → Application → Domain`. Aucune couche interne ne connaît une couche externe — par exemple, un *handler* Application ne doit jamais importer un *endpoint* API ni un repository concret de l'Infrastructure ; il ne dépend que du port qu'il déclare.

## Dans le cycle SKRAFT

- Lors de la phase **DESIGN**, le `solution-architect` définit les interfaces et les boundaries de cette architecture.
- L'approche Outside-In TDD dans la phase **DELIVER** force l'équipe à définir d'abord le comportement externe (Acceptance tests) avant d'implémenter les couches internes, garantissant ainsi le respect strict de la Clean Architecture.

Ce paradigme, bien que nécessitant un investissement initial plus lourd, apporte une maintenabilité et une testabilité incomparables sur le long terme.
