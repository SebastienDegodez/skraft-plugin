---
layout: doc
lang: fr
title: "acceptance-designer"
persona: tech-lead
---

# acceptance-designer

> Transforme les décisions d'architecture en scénarios BDD exécutables (Gherkin) et en plan d'implémentation.

## Quand l'utiliser

- Phase DISTILL du pipeline
- Après validation de l'architecture par le solution-architect-reviewer
- Trigger : dispatch par l'orchestrateur

## Contrat d'entrée

- ADRs et diagrammes de composants approuvés (DESIGN validé)
- Story affinée avec critères d'acceptation

## Contrat de sortie

- Fichiers `.feature` (scénarios Gherkin Given-When-Then)
- Plan d'implémentation structuré
- Matrice de couverture tests ↔ critères d'acceptation

## Invariants

- **Tests avant code** — Les scénarios d'acceptation existent avant toute implémentation
- **Langage métier** — Les scénarios utilisent le vocabulaire du domaine, pas le vocabulaire technique
- Voir [Customisation](/fr/customisation) pour la liste complète

## Pourquoi cette forme

Les scénarios BDD sont des spécifications exécutables. Ils capturent le comportement attendu dans un langage partagé entre développeurs et experts métier, éliminant l'ambiguïté des spécifications textuelles.

> « Specification by Example is a set of process patterns that facilitate change in software products. »
> — Adzic, G., *Specification by Example*, 2011.

Écrire les tests avant le code force à réfléchir au comportement attendu plutôt qu'à l'implémentation. C'est le principe fondateur du TDD appliqué au niveau acceptation.

> « Test-driven development is a way of managing fear during programming. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

## Customisation autorisée

- Profondeur des scénarios (smoke vs exhaustif) (L2)
- Template Gherkin et conventions de nommage (L1)
- Tags et catégorisation des scénarios (L1)

## Voir aussi

- [acceptance-designer-reviewer](/fr/reference/agents/acceptance-designer-reviewer) — Revue des artefacts DISTILL
- [Pipeline DISTILL](/fr/pipeline/distill) — Description de la phase
- [software-engineer](/fr/reference/agents/software-engineer) — Phase suivante (DELIVER)
