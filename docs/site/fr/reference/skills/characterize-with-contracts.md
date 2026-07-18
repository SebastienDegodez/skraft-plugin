---
layout: doc
lang: fr
title: "characterize-with-contracts"
description: "Découvre ou reconstruit le contrat d'API d'un service et produit des tests de caractérisation golden-master qui verrouillent le comportement ACTUEL — bugs inclus."
persona: tech-lead
---

# characterize-with-contracts

> Réutilise la machinerie roster/adapter de `contract-testing-roster` et `mocking-strategy-roster`, mais avec l'intention inverse : encoder ce que le code FAIT réellement, maintenant, pour vérifier qu'un refactor ne change pas le comportement.

## Quand l'utiliser

- Construire un filet de sécurité basé sur les contrats avant de refactorer un service brownfield
- « caractérise cette API », « verrouille le comportement actuel », « construis un filet basé sur les contrats »
- Chargé par [brownfield-harness-builder]({{ "/fr/reference/agents/brownfield-harness-builder" | relative_url }})

## Contrat d'entrée

- Chemin du service / nom du projet
- Fichier de contrat existant, si connu

## Contrat de sortie

- Contrat(s) découvert(s) ou reconstruit(s), commité(s) sous le projet de test
- Projet/fichiers de tests de caractérisation (le golden master)
- Rapport de verdict du gate (PASS/CONCERNS/FAIL) : endpoints couverts, causes des CONCERNS

## Invariants

- **Jamais « corriger » un bug trouvé** — l'écrire comme comportement actuel avec `// CHARACTERIZATION` ; le fix est une décision humaine ultérieure
- **Jamais toucher le code service pour faire passer le harness** — un test de caractérisation rouge = harness faux, pas code faux
- **Déléguer le câblage** — stack via `contract-testing-roster`, mocking via `mocking-strategy-roster` ; aucun vocabulaire de wiring nouveau
- **Green-before-refactor gate (S4)** — suite entière verte contre le code NON modifié, chaque endpoint découvert couvert

## Pourquoi cette forme

Un test de caractérisation encode le comportement actuel exact (status, forme, valeur) — golden master — pour qu'un refactor soit vérifié non-régressif. Le contrat, découvert ou reconstruit, est le langage commun entre l'ancien et le nouveau comportement.

> « Consumer-driven contracts let the consumer specify what it needs from a provider. »
> — Newman, S., *Building Microservices, 2nd ed.*, 2021.

## Customisation autorisée

- Contrat de base : découvert (spec existante) ou reconstruit (tooling du framework préféré au transcodage manuel)
- Stratégie de mocking résolue par le roster (Microcks par défaut)

## Voir aussi

- [brownfield-harness-builder]({{ "/fr/reference/agents/brownfield-harness-builder" | relative_url }}) — Agent qui charge ce skill
- [contract-testing-roster]({{ "/fr/reference/skills/contract-testing-roster" | relative_url }}) — Résout l'adaptateur de stack
- [mocking-strategy-roster]({{ "/fr/reference/skills/mocking-strategy-roster" | relative_url }}) — Résout la stratégie de mock (Microcks par défaut)
- [Brownfield]({{ "/fr/explanation/brownfield" | relative_url }}) — Vue d'ensemble de la famille
