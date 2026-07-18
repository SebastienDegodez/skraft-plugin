---
layout: doc
lang: fr
title: "brownfield-harness-builder"
description: "Rend un service brownfield SÛR À MODIFIER avant refactor : contrats d'API, mocks Microcks, tests de caractérisation golden-master. Workflow autonome."
persona: tech-lead
---

# brownfield-harness-builder

> Construit le filet de sécurité qu'un service brownfield exige avant tout refactor : découvre ou reconstruit son contrat d'API, monte les mocks Microcks pour ses dépendances, et verrouille ce qu'il fait MAINTENANT — bugs inclus.

## Quand l'utiliser

- Rendre un service existant sûr à modifier avant de le refactorer
- « construis un filet de sécurité », « caractérise cette API avant refactor », « verrouille le comportement actuel »
- Workflow autonome — invoqué directement, pas une phase de l'orchestrateur

## Contrat d'entrée

- Chemin du service cible ou nom du projet (requis)
- Fichier de contrat existant, si connu

## Contrat de sortie

- Contrat(s) découvert(s) ou reconstruit(s)
- Projet/fichiers de tests de caractérisation
- Rapport de verdict du gate (PASS/CONCERNS/FAIL, lacunes de couverture)

## Invariants

- **Jamais « corriger » un bug trouvé pendant la caractérisation** — le capturer comme comportement actuel ; le fix est une décision humaine ultérieure
- **Jamais toucher le code service pour faire passer le harness** — un test rouge contre le code non modifié signifie que le harness est faux
- **Jamais réinventer le wiring stack/mocking** — déléguer via `characterize-with-contracts` (contract-testing-roster / mocking-strategy-roster)
- **Jamais procéder au refactor** — hors scope ; handoff du verdict et stop

## Pourquoi cette forme

Le harness verrouille le comportement actuel avant qu'on y touche : une porte green-before-refactor (S4) exige la suite entière verte contre le code non modifié. Sur CONCERNS, l'humain décide (B10) de procéder au risque acceptable ou de renforcer le filet.

> « A characterization test is a test that characterizes the actual behavior of a piece of code. »
> — Feathers, M., *Working Effectively with Legacy Code*, 2004.

## Customisation autorisée

- Fichier de contrat existant fourni si connu (sinon reconstruit depuis les routes)
- Stratégie de mocking déléguée au roster (Microcks par défaut)

## Voir aussi

- [characterize-with-contracts]({{ "/fr/reference/skills/characterize-with-contracts" | relative_url }}) — Skill exécuté (découverte/reconstruction, tests golden-master)
- [brownfield-refactorer]({{ "/fr/reference/agents/brownfield-refactorer" | relative_url }}) — Étape suivante : pilote le refactor une fois le verdict acceptable
- [brownfield-analyst]({{ "/fr/reference/agents/brownfield-analyst" | relative_url }}) — Workflow frère : PRD par rétro-ingénierie
- [Brownfield]({{ "/fr/explanation/brownfield" | relative_url }}) — Vue d'ensemble de la famille
