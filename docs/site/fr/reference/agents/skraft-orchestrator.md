---
layout: doc
lang: fr
title: "skraft-orchestrator"
persona: tech-lead
---

# skraft-orchestrator

> Orchestre l'intégralité du pipeline SDLC, de DISCOVER à DELIVER, en dispatchant les commandes vers les agents spécialisés.

## Quand l'utiliser

- Commande `/skraft` ou assignation d'un numéro d'issue
- Point d'entrée unique du pipeline — toutes les phases
- Persona : tech-lead

## Contrat d'entrée

- Numéro d'issue GitHub ou commande `/skraft`
- Repository avec structure de projet initialisée

## Contrat de sortie

- Toutes les phases complétées (DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER)
- Artefacts commités sur la branche de travail
- `state.json` mis à jour avec le statut final

## Invariants

- **Ordre des phases** — DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER, jamais d'inversion
- **CQS** — L'orchestrateur dispatche des commandes mais n'écrit jamais d'artefacts directement ; il lit `state.json` pour décider de la prochaine action
- **Retry borné** — Chaque cycle exécuteur → reviewer a un nombre maximal de tentatives
- Voir [Customisation]({{ "/fr/how-to/customisation" | relative_url }}) pour la liste complète

## Pourquoi cette forme

L'orchestrateur est un coordinateur pur. Il ne possède aucune logique métier, aucune capacité d'écriture d'artefacts. Cette séparation applique CQS au niveau système : les commandes partent vers les exécuteurs, les queries reviennent des reviewers.

> « Asking a question should not change the answer. »
> — Meyer, B., *Object-Oriented Software Construction, 2nd ed.*, 1997.

Le choix d'un point d'entrée unique reflète le principe pragmatique de modularité textuelle. Chaque agent est un fichier autonome, composable, remplaçable — l'orchestrateur les assemble sans les fusionner.

> « Keep knowledge in plain text. »
> — Hunt, A. & Thomas, D., *The Pragmatic Programmer, 20th anniversary ed.*, 2019.

## Customisation autorisée

- Nombre de retries par phase (L2)
- Vocabulaire des messages de dispatch (L1)
- Ajout de phases intermédiaires (L3, avec précaution — voir [Customisation]({{ "/fr/how-to/customisation" | relative_url }}))

## Voir aussi

- [Architecture]({{ "/fr/explanation/architecture" | relative_url }}) — Vue CQS du pipeline
- [Pipeline]({{ "/fr/explanation/pipeline/" | relative_url }}) — Description de chaque phase
- [Concepts fondamentaux]({{ "/fr/explanation/concepts" | relative_url }}) — CQS, CQRS, Walking Skeleton
