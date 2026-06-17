---
layout: doc
lang: fr
title: "Patterns d'architecture"
description: "Les patterns qui structurent la phase DESIGN : Event Modeling, DDD, Clean Architecture, CQRS, Event Sourcing — avec leur référence."
---

# Patterns d'architecture

> Les patterns ne s'empilent pas au hasard. SKRAFT les compose dans un ordre précis,
> chacun appuyé sur l'ouvrage qui l'a défini.

## Pourquoi — le problème que ça résout

Choisir une architecture « au feeling » produit des systèmes incohérents et coûteux
à faire évoluer. S'appuyer sur des patterns nommés donne un **langage commun** et une
**justification traçable** : chaque décision structurelle renvoie à un pattern connu
et à sa source.

## Concepts clés — comment ça marche

Ordre de composition imposé : Event Modeling → DDD stratégique → DDD tactique →
Clean Architecture → CQRS, avec Event Sourcing à la frontière Domain/Infrastructure
quand l'historique a de la valeur.

| Pattern | En une phrase | Référence |
| --- | --- | --- |
| **Event Modeling** | Modéliser le système comme une suite d'événements et de commandes avant de coder. | North, D., *Introducing BDD*, 2006. |
| **DDD stratégique** | Découper le domaine en *bounded contexts* avec un langage ubiquitaire par contexte. | Evans, E., *Domain-Driven Design*, 2003. |
| **DDD tactique** | Agrégats, value objects, événements de domaine : les briques qui protègent les invariants. | Vernon, V., *Implementing Domain-Driven Design*, 2013. |
| **Clean Architecture** | Règle de dépendance : le métier ne dépend jamais de l'infrastructure. | Martin, R. C., *Clean Architecture*, 2017. |
| **Architecture hexagonale** | Ports & adaptateurs : isoler le domaine derrière des interfaces. | Cockburn, A., *Hexagonal Architecture*, 2005. |
| **CQRS** | Séparer le modèle d'écriture du modèle de lecture, *quand un vrai problème le justifie*. | Fowler, M., *Bliki: CQRS*, 2011. |

Chaque pattern complexifiant (CQRS, Event Sourcing, Saga…) n'est adopté qu'avec une
force explicite et une alternative « faire sans » évaluée — c'est une gate de la phase
DESIGN.

## Pourquoi cette pratique

> « The heart of software is its ability to solve domain-related problems for its user. »
> — Evans, E., *Domain-Driven Design*, 2003.

Les patterns ne sont pas une fin : ils servent à garder le modèle du domaine au centre.

## Pièges & anti-patterns

- **Pattern-driven design** : adopter CQRS « parce que c'est moderne » sans problème
  concret — la skill l'interdit explicitement.
- **Big Design Up Front** : modéliser l'ensemble du système avant d'avoir un seul
  scénario — préférer l'incrément (voir [walking skeleton]({{ "/fr/explanation/deep-dive/walking-skeleton" | relative_url }})).

## Pour aller plus loin

- [La phase DESIGN]({{ "/fr/explanation/pipeline/design" | relative_url }})
- [Clean Architecture]({{ "/fr/explanation/clean-architecture" | relative_url }})
- [Les gates DESIGN](gates.html)

## Sources

- North, D. *Introducing BDD*, 2006.
- Evans, E. *Domain-Driven Design*, 2003.
- Vernon, V. *Implementing Domain-Driven Design*, 2013.
- Martin, R. C. *Clean Architecture*, 2017.
- Cockburn, A. *Hexagonal Architecture*, 2005.
- Fowler, M. *Bliki: CQRS*, 2011.

Termes à connaître : **bounded context**, **agrégat**, **value object**, **CQRS**,
**Event Sourcing** — voir le [glossaire]({{ "/fr/reference/glossary" | relative_url }}).
