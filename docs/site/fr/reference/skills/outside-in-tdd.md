---
layout: doc
lang: fr
title: "outside-in-tdd"
persona: tech-lead
---

# outside-in-tdd

> Méthodologie TDD qui commence par les tests d'acceptation (comportement observable) et laisse le design interne émerger.

## Quand l'utiliser

- Lors de l'implémentation de toute feature dans la phase DELIVER
- Quand les tests doivent partir du comportement métier, pas des détails techniques
- Avant d'écrire la moindre ligne de code de production : ce skill porte le cycle RED → SYNTHESIZE GREEN

## Contrat d'entrée

- Scénarios BDD approuvés (fichiers `.feature`)
- Architecture définie (ADRs, bounded contexts)

## Contrat de sortie

- Tests d'acceptation passants
- Tests unitaires couvrant les invariants du domaine
- Design émergent (pas de sur-ingénierie)

## Invariants

- **Acceptation d'abord** — Le premier test écrit est toujours un test d'acceptation
- **Walking Skeleton** — La première implémentation traverse toutes les couches
- **Double boucle** — Boucle externe (acceptation) guide la boucle interne (unitaire)
- Voir [Customisation]({{ "/fr/how-to/customisation" | relative_url }}) pour la liste complète

## Pourquoi cette forme

L'Outside-In TDD commence par ce que le système doit faire (le comportement observable) et descend vers comment il le fait. Le test d'acceptation est le premier écrit, le dernier à passer.

> « Start with an acceptance test that exercises the functionality you want to build. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

Cette approche empêche la sur-ingénierie : on n'écrit que le code nécessaire pour faire passer les tests. Le design émerge des besoins réels, pas d'hypothèses.

> « The two rules of TDD: write new code only if an automated test has failed; eliminate duplication. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

## Customisation autorisée

- Profondeur du Walking Skeleton (L2)
- Stratégie de test doubles par frontière (L2)
- Conventions de nommage des tests (L1)

## Voir aussi

- [clean-architecture-testing]({{ "/fr/reference/skills/clean-architecture-testing" | relative_url }}) — Tests par couche
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent qui utilise ce skill
- [Concepts fondamentaux — Walking Skeleton]({{ "/fr/explanation/concepts" | relative_url }}) — Principe sous-jacent
