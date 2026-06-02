---
layout: default
lang: fr
title: "SKRAFT en 15 minutes"
persona: tech-lead
---

# SKRAFT en 15 minutes

SKRAFT est un pipeline SDLC piloté par des agents IA spécialisés. Chaque phase du cycle de développement est exécutée par un agent dédié, puis validée par un reviewer indépendant — aucun agent ne valide son propre travail.

> « Programs must be written for people to read, and only incidentally for machines to execute. »
> — Abelson, H. & Sussman, G. J., *Structure and Interpretation of Computer Programs*, 1985.

Cette page est un **manuel guidé** : elle suit le pipeline phase par phase, explique ce que chaque agent et chaque skill apportent, puis renvoie vers les pages détaillées pour aller plus loin.

## Le flux guidé : DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER

{% include mermaid.html code="graph LR
    D[DISCOVER] --> DI[DISCUSS]
    DI --> DE[DESIGN]
    DE --> DIS[DISTILL]
    DIS --> DEL[DELIVER]
    style D fill:#1a3a2a,stroke:#4ed58a
    style DI fill:#1a3a2a,stroke:#4ed58a
    style DE fill:#1a3a2a,stroke:#4ed58a
    style DIS fill:#1a3a2a,stroke:#4ed58a
    style DEL fill:#1a3a2a,stroke:#4ed58a" %}

Les cinq phases s'enchaînent pour traiter exactement un Use Case par cycle — pas de batching, pas de raccourcis.

## Les 5 phases : agents, skills et livrables attendus

### 1. DISCOVER

- **Agent** — `backlog-discoverer` trie et priorise les issues.
- **Skills mobilisés** — routage de difficulté et triage du backlog.
- **Livrable attendu** — un rapport de triage actionnable qui ouvre le cycle.

[Détail de la phase DISCOVER](/fr/pipeline/discover)

### 2. DISCUSS

- **Agent** — `backlog-planner` affine les stories selon les critères INVEST.
- **Skills mobilisés** — affinage d'issue et formulation de critères d'acceptation.
- **Livrable attendu** — des stories prêtes, assorties de critères d'acceptation explicites.

[Détail de la phase DISCUSS](/fr/pipeline/discuss)

### 3. DESIGN

- **Agent** — `solution-architect` modélise l'architecture via Event Modeling, DDD et ADR.
- **Skills mobilisés** — patterns d'architecture, décisions d'architecture (ADR) et critères de revue.
- **Livrable attendu** — un modèle d'architecture et des décisions tracées.

[Détail de la phase DESIGN](/fr/pipeline/design)

### 4. DISTILL

- **Agent** — `acceptance-designer` traduit les décisions d'architecture en scénarios Gherkin exécutables.
- **Skills mobilisés** — conception d'acceptation et mandats de conception de tests.
- **Livrable attendu** — des scénarios d'acceptation exécutables.

[Détail de la phase DISTILL](/fr/pipeline/distill)

### 5. DELIVER

- **Agent** — `software-engineer` implémente le code via Outside-In TDD.
- **Skills mobilisés** — TDD outside-in, discipline d'artisanat et tests d'architecture propre, avec le Mutation Score comme garde-fou qualité.
- **Livrable attendu** — du code livré, couvert et vérifié.

[Détail de la phase DELIVER](/fr/pipeline/deliver)

## Positionnement Clean Architecture

SKRAFT applique le principe CQS (Command-Query Separation) au niveau système : les agents exécuteurs commandent (ils écrivent des artefacts), les agents reviewers querient (ils lisent sans modifier). Cette séparation des responsabilités est l'expression, à l'échelle du pipeline, de la Clean Architecture.

> « The only way to go fast is to go well. »
> — Martin, R. C., *Clean Architecture*, 2017.

[Voir l'architecture du pipeline](/fr/architecture)

## Object Calisthenics : pourquoi cette discipline

En phase DELIVER, le `software-engineer` applique la discipline d'artisanat (dont les Object Calisthenics) pour contraindre la forme du code : petites unités, encapsulation forte, intentions explicites. L'objectif n'est pas l'esthétique mais la **vérifiabilité** : un code discipliné est plus simple à reviewer et à muter.

[Voir les concepts fondamentaux](/fr/concepts)

## Traçabilité des décisions (ADR)

Chaque décision d'architecture significative est consignée dans un ADR (Architecture Decision Record) en phase DESIGN. Les ADR rendent les choix **opposables** : un reviewer peut retrouver le pourquoi d'une décision, et un repreneur peut comprendre l'historique sans relire tout le code.

[Voir Architecture](/fr/architecture) · [Voir Concepts](/fr/concepts)

## Pour aller plus loin

- **Décideurs** — Lisez [Pour les décideurs](/fr/pour-decideurs) pour comprendre le ROI.
- **Développeurs** — Explorez [le pipeline en détail](/fr/pipeline/) phase par phase.
- **Architecture** — Comprenez [l'architecture](/fr/architecture) et les [concepts](/fr/concepts).
- **Référence** — Consultez la [référence des agents](/fr/reference/agents/) et des [skills](/fr/reference/skills/).
- **Prêt à démarrer** — Suivez le guide [Getting Started](/fr/getting-started).
