---
layout: doc
lang: fr
title: "clean-architecture-testing"
persona: tech-lead
---

# clean-architecture-testing

> Définit quoi tester à chaque couche de Clean Architecture, avec quel type de test double et à quelle granularité.

## Quand l'utiliser

- Lorsqu'on décide quoi tester et à quel niveau (Domain, Application, Infrastructure, API, Architecture)
- En préparation de la phase DELIVER
- Pour résoudre un conflit « ce test est-il unitaire ou d'intégration ? »

## Contrat d'entrée

- Architecture définie (bounded contexts, layers, ports/adapters)
- Scénarios BDD existants (fichiers `.feature`)

## Contrat de sortie

- Matrice de couverture : couche × type de test
- Stratégie de test doubles par frontière (stub, mock, spy, fake)

## Invariants

- **Pas de test en double** — Chaque comportement est testé à une seule couche
- **Domain = tests unitaires purs** — Aucune dépendance externe dans les tests du domaine
- **Infrastructure = tests d'intégration** — Les adapters sont testés avec les vrais systèmes
- Voir [Customisation](/fr/customisation) pour la liste complète

## Pourquoi cette forme

L'architecture doit supporter les cas d'usage du système — et les tests doivent refléter cette structure. Tester au mauvais niveau crée des suites fragiles qui cassent sans raison métier.

> « Good architecture makes the system easy to understand, easy to develop, easy to maintain, and easy to deploy. »
> — Martin, R. C., *Clean Architecture*, 2017.

Les test doubles (stubs, mocks, fakes) sont choisis en fonction de la frontière architecturale qu'ils remplacent, pas par commodité technique.

> « Replace a component that the SUT depends on with a test-specific equivalent. »
> — Meszaros, G., *xUnit Test Patterns*, 2007.

## Customisation autorisée

- Types de test doubles autorisés par couche (L2)
- Seuil de couverture par couche (L2)
- Conventions de nommage des tests (L1)

## Voir aussi

- [outside-in-tdd](/fr/reference/skills/outside-in-tdd) — Skill TDD Outside-In
- [software-engineer](/fr/reference/agents/software-engineer) — Agent qui utilise ce skill
- [Architecture](/fr/architecture) — Vue CQS du pipeline
