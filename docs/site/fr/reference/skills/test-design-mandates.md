---
layout: doc
lang: fr
title: "test-design-mandates"
description: "Use when designing test coverage matrices, assigning tests to Clean Architecture layers, planning the outside-in impl..."
persona: tech-lead
---

# test-design-mandates

> Cinq règles obligatoires qui régissent la conception des tests dans un contexte Clean Architecture — chargées après l'écriture des scénarios Gherkin, avant toute implémentation.

## Quand l'utiliser

- Après la validation des scénarios Gherkin (sortie de DISTILL)
- Pour concevoir la matrice de couverture avant l'implémentation
- Pour décider si un test unitaire de domaine est autorisé (Mandate 4)
- Pour planifier l'ordre d'implémentation outside-in et la Walking Skeleton

## Contrat d'entrée

- Scénarios Gherkin validés par l'utilisateur
- Architecture Clean Architecture identifiée (Domain / Application / Infrastructure / API)
- La barre qualité permanente (skill `skraft-quality-bar`) — la même barre sur chaque story ; aucun niveau de rigueur à lire

## Contrat de sortie

- Matrice de couverture par story avec colonnes : Scénario, Use Case Boundary, Layer, Extraction Reason, Double Type, Walking Skeleton, Priority
- Chaque ligne Domain portant un code `Extraction Reason` valide (`branch_unreachable_via_AC` ou `combinatorial_economy`), ou supprimée
- Ordre d'implémentation P1 (Walking Skeleton) → P2 (règles métier) → P3 (infrastructure)

## Invariants

- **M1 — Frontière de use case** — tout test d'Application entre par le use case ; jamais d'instanciation directe d'une classe interne de domaine
- **M2 — Abstraction du langage métier** — trois couches strictes : Gherkin (métier pur) / Step methods (pont) / Business services (technique) ; aucun vocabulaire technique ne remonte vers Gherkin
- **M3 — Complétude du parcours utilisateur** — chaque scénario inclut Setup (Given) + Action (When, une seule) + Observable Outcome (Then)
- **M4 — Extraction de domaine conditionnelle par défaut interdite** — pas de test unitaire de domaine sauf si la porte (a) branche inaccessible via AC ou (b) économie combinatoire s'ouvre
- **M5 — Application de l'AC visuel/positionnel** — une AC en termes visuels/positionnels/de style (tag `@visual`) n'est close que par un test E2E Playwright avec mesure réelle ; un seul test unitaire jsdom ne suffit pas
- **TBU interdit** — aucun code de production non câblé via le root de composition ; les tests d'acceptance valident le câblage réel
- **Aucun mode réduit** — les cinq mandates s'appliquent à chaque story ; rien ne les relâche et aucune rationale n'achète d'exemption

## Pourquoi cette forme

Les tests entrent par une frontière de use case et assertent à la prochaine frontière visible. Cette règle prévient les défauts TBU (Tested But Unwired) — du code qui fonctionne en isolation mais n'est jamais appelé via le vrai root de composition.

> « Grow the application outside-in, letting the tests guide the internal design. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

La règle M4 évite la double couverture : deux suites assertant le même comportement divergent à chaque changement de règle, sans valeur discriminante supplémentaire.

M4 n'abaisse rien — elle décide seulement où vivent les tests. Domain et Application doivent toujours atteindre la barre de mutation et de couverture de lignes définie par `skraft-quality-bar` ; donc lorsque aucune porte d'extraction ne s'ouvre, ce sont les tests d'acceptance entrant par la frontière de use case qui doivent gagner ces chiffres. La matrice se conçoit en conséquence : un jeu de scénarios laissant survivre des mutants du Domain est une matrice incomplète, pas une raison de relâcher la barre.

## Customisation autorisée

- Seuil combinatoire M4 — le compte indicatif de 10–15 scénarios peut être ajusté par projet ; les deux portes d'extraction, elles, ne le peuvent pas (L2)
- Codes `Extraction Reason` additionnels pour des cas d'infrastructure spéciaux (L3, changement de schéma)

## Voir aussi

- [outside-in-tdd]({{ "/fr/reference/skills/outside-in-tdd" | relative_url }}) — Cycle TDD double-boucle
- [bdd-methodology]({{ "/fr/reference/skills/bdd-methodology" | relative_url }}) — Écriture des scénarios Gherkin
- [clean-architecture-testing]({{ "/fr/reference/skills/clean-architecture-testing" | relative_url }}) — Tests par couche Clean Architecture
- [acceptance-designer]({{ "/fr/reference/agents/acceptance-designer" | relative_url }}) — Agent DISTILL qui produit la matrice
