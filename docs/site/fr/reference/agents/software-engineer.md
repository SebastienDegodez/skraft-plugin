---
layout: doc
lang: fr
title: "software-engineer"
persona: tech-lead
---

# software-engineer

> Implémente le code via Outside-In TDD, en commençant par un Walking Skeleton et en progressant jusqu'au mutation score requis.

## Quand l'utiliser

- Phase DELIVER du pipeline
- Après validation des scénarios BDD par l'acceptance-designer-reviewer
- Trigger : dispatch par l'orchestrateur

## Contrat d'entrée

- Fichiers `.feature` approuvés (DISTILL validé)
- Plan d'implémentation
- Architecture décidée (ADRs)

## Contrat de sortie

- Code implémenté avec tous les tests passants
- Mutation score au-dessus du seuil configuré
- Artefacts commités sur la branche de travail

## Invariants

- **Walking Skeleton d'abord** — La première itération traverse toutes les couches de bout en bout
- **Mutation score floor** — Le score de mutation doit dépasser le seuil minimum
- **Outside-In TDD** — Tests d'acceptation → tests unitaires → implémentation
- **Object Calisthenics** — Contraintes de design appliquées au code métier
- **Fan-out du câblage de test** — Délègue le wiring des tests aux sous-agents internes `mock-integration-worker` et `contract-testing-worker` (`user-invocable: false`), vérifiés en TIER-1 (RED → GREEN)
- Voir [Customisation]({{ "/fr/how-to/customisation" | relative_url }}) pour la liste complète

## Pourquoi cette forme

L'implémentation commence par les tests d'acceptation, pas par le code. Le Walking Skeleton assure qu'une tranche fonctionnelle complète existe avant d'enrichir les détails.

> « A walking skeleton is a tiny implementation of the system that performs a small end-to-end function. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

Le cycle Outside-In TDD (RED acceptance → RED unit → GREEN → REFACTOR) guide l'émergence du design depuis le comportement observable vers les détails internes.

> « Test-driven development is a way of managing fear during programming. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

Le mutation testing vérifie que les tests détectent réellement les défauts, au-delà de la simple couverture de lignes.

> « Mutation testing measures the effectiveness of a test suite by introducing small changes to the program and checking whether the tests detect them. »
> — Jia, Y. & Harman, M., *An Analysis and Survey of the Development of Mutation Testing*, 2011.

## Customisation autorisée

- Seuil de mutation score (L2)
- Règles Object Calisthenics activées (L2)
- Profondeur du Walking Skeleton (L2)

## Voir aussi

- [software-engineer-reviewer]({{ "/fr/reference/agents/software-engineer-reviewer" | relative_url }}) — Revue des artefacts DELIVER
- [software-engineer-and-reviewer]({{ "/fr/reference/agents/software-engineer-and-reviewer" | relative_url }}) — Cycle complet DELIVER
- [Pipeline DELIVER]({{ "/fr/explanation/pipeline/deliver" | relative_url }}) — Description de la phase
- [outside-in-tdd]({{ "/fr/reference/skills/outside-in-tdd" | relative_url }}) — Skill TDD
