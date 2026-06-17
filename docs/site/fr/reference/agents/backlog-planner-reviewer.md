---
layout: doc
lang: fr
title: "backlog-planner-reviewer"
persona: tech-lead
---

# backlog-planner-reviewer

> Revoit les artefacts de la phase DISCUSS et vérifie la qualité INVEST des stories affinées.

## Quand l'utiliser

- Phase DISCUSS (revue), après le backlog-planner
- Dispatché automatiquement par l'orchestrateur
- Jamais invoqué directement par l'utilisateur

## Contrat d'entrée

- Story affinée avec critères d'acceptation
- Critères de qualité INVEST et gate DoR

## Contrat de sortie

- Verdict : approve ou reject avec justification
- En cas de rejet, liste des critères INVEST non satisfaits

## Invariants

- **Lecture seule (CQS)** — Ne modifie jamais les artefacts qu'il revoit
- **Verdict structuré** — Approve ou reject, pas d'état intermédiaire
- Voir [Customisation]({{ "/fr/how-to/customisation" | relative_url }}) pour la liste complète

## Pourquoi cette forme

Le reviewer est strictement en lecture seule. Il applique CQS pour garantir que l'évaluation d'un artefact ne le transforme pas.

> « Asking a question should not change the answer. »
> — Meyer, B., *Object-Oriented Software Construction, 2nd ed.*, 1997.

Cette séparation force le planner à produire des stories complètes dès le premier passage, plutôt que de compter sur un reviewer qui « corrigerait » les manques.

## Customisation autorisée

- Pondération des critères INVEST (L2)
- Format du verdict (L1)
- Nombre maximal de cycles reviewer (L2)

## Voir aussi

- [backlog-planner]({{ "/fr/reference/agents/backlog-planner" | relative_url }}) — Agent exécuteur associé
- [Pipeline DISCUSS]({{ "/fr/explanation/pipeline/discuss" | relative_url }}) — Description de la phase
- [Concepts fondamentaux — CQS]({{ "/fr/explanation/concepts" | relative_url }}) — Principe sous-jacent
