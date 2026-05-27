---
layout: default
lang: fr
title: "solution-architect"
persona: tech-lead
---

# solution-architect

> Conçoit l'architecture logicielle via Event Modeling, DDD stratégique et tactique, et produit les ADRs et diagrammes de composants.

## Quand l'utiliser

- Phase DESIGN du pipeline
- Après validation de la story par le backlog-planner-reviewer
- Trigger : dispatch par l'orchestrateur

## Contrat d'entrée

- Story affinée et approuvée (DISCUSS validé)
- Contexte architectural existant (ADRs précédents, bounded contexts)

## Contrat de sortie

- Architecture Decision Records (ADRs)
- Diagrammes de composants
- Event Model (commandes, événements, read models)
- Frontières de bounded contexts

## Invariants

- **Clean Architecture** — Les dépendances pointent vers l'intérieur, jamais vers l'extérieur
- **Un Use Case = un passage** — Chaque story est traitée comme un Use Case complet
- Voir [Customisation](/fr/customisation) pour la liste complète

## Pourquoi cette forme

Le modèle architectural n'est pas un diagramme décoratif — c'est un outil de communication entre développeurs et experts métier. L'Event Model capture le comportement du système dans un langage partagé.

> « The model is a set of concepts built up in the heads of people on the project, with terms and relationships that reflect domain insight. »
> — Evans, E., *Domain-Driven Design*, 2003.

Les ADRs documentent les décisions et leurs conséquences, rendant l'architecture auditable et réversible.

> « Good architecture makes the system easy to understand, easy to develop, easy to maintain, and easy to deploy. »
> — Martin, R. C., *Clean Architecture*, 2017.

## Customisation autorisée

- Profondeur de l'Event Model (L2)
- Template ADR (L1)
- Patterns tactiques DDD autorisés (L2)

## Voir aussi

- [solution-architect-reviewer](/fr/reference/agents/solution-architect-reviewer) — Revue des artefacts DESIGN
- [Pipeline DESIGN](/fr/pipeline/design) — Description de la phase
- [acceptance-designer](/fr/reference/agents/acceptance-designer) — Phase suivante (DISTILL)
- [Architecture](/fr/architecture) — Vue d'ensemble du pipeline
