---
layout: doc
lang: fr
title: "architecture-patterns"
description: "Use when selecting architecture patterns for a new feature, performing Event Modeling, defining bounded contexts, cho..."
persona: tech-lead
---

# architecture-patterns

> Catalogue de patterns architecturaux pour les systèmes Clean Architecture + DDD + Event-Driven : Event Modeling, DDD stratégique, DDD tactique, CQRS et Event Sourcing.

## Quand l'utiliser

- Pour sélectionner des patterns adaptés à une nouvelle fonctionnalité ou story
- Pour effectuer un Event Modeling et construire la timeline Command → Event → Read Model
- Pour définir des bounded contexts et choisir les relations de context mapping
- Pour évaluer la pertinence d'un pattern avant de décider d'en documenter un ADR

## Contrat d'entrée

- Stories DISCUSS ou requirements de la phase DESIGN
- Contraintes qualité (performance, évolutivité, auditabilité)
- Baseline technique du projet (skills `clean-architecture-*`)

## Contrat de sortie

- Timeline Event Model annotée (mermaid) avec Commands, Events et Read Models
- Sélection justifiée des patterns DDD tactiques (agrégats, entités, value objects, repositories)
- Context map avec relations étiquetées (ACL, Conformist, Open Host Service, Published Language, etc.)
- Justification de sélection pour tout pattern ajoutant de la complexité (CQRS+Bus, Event Sourcing, Saga)

## Invariants

- **Principe YAGNI** — chaque pattern est justifié par une story ou un quality attribute, pas par une préférence
- **Ordre de composition** : Event Modeling → DDD Stratégique → DDD Tactique → Clean Architecture → CQRS
- **Un agrégat Core ne peut pas être Conformist** — il protège son Ubiquitous Language via un ACL
- **Une copie locale ou une traduction est un ACL**, même triviale — jamais Conformist
- **Référence d'agrégat uniquement par ID** — jamais par référence d'objet inter-agrégat

**Notation mermaid pour le context mapping :**

```
graph LR
    EligibilityContext -->|ACL| PolicyContext
    PolicyContext -->|Conformist| BillingContext
    EligibilityContext -->|Published Language| NotificationContext
```

## Pourquoi cette forme

Les patterns ne sont pas des fins en soi : ce sont des outils de communication d'invariants métier dans le code. Event Modeling démarre la session DESIGN du bon pied en rendant la timeline des faits métier visible avant toute décision tactique.

> « The heart of software is its ability to solve domain-related problems for its user. »
> — Evans, E., *Domain-Driven Design*, 2003.

> « Separate the domain layer from the application, infrastructure, and presentation layers. »
> — Martin, R. C., *Clean Architecture*, 2017.

## Customisation autorisée

- Notation des diagrammes Event Model (L1)
- Classification des sous-domaines (Core / Supporting / Generic) selon le contexte métier (L1)
- Patterns supplémentaires à inclure dans le catalogue (L2)

## Voir aussi

- [architecture-decisions]({{ "/fr/reference/skills/architecture-decisions" | relative_url }}) — ADRs pour les patterns ajoutant de la complexité
- [architecture-review-criteria]({{ "/fr/reference/skills/architecture-review-criteria" | relative_url }}) — Gates qui vérifient la conformité DDD et Clean Architecture
- [solution-architect]({{ "/fr/reference/agents/solution-architect" | relative_url }}) — Agent qui applique ce catalogue
