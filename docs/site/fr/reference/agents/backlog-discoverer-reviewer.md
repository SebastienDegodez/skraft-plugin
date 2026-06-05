---
layout: doc
lang: fr
title: "backlog-discoverer-reviewer"
persona: tech-lead
---

# backlog-discoverer-reviewer

> Revoit les artefacts de la phase DISCOVER et émet un verdict sans modifier aucun artefact.

## Quand l'utiliser

- Phase DISCOVER (revue), après le backlog-discoverer
- Dispatché automatiquement par l'orchestrateur
- Jamais invoqué directement par l'utilisateur

## Contrat d'entrée

- Rapport de triage produit par le backlog-discoverer
- Critères de qualité définis (labels, priorité, effort)

## Contrat de sortie

- Verdict : approve ou reject avec justification
- En cas de rejet, liste des points à corriger

## Invariants

- **Lecture seule (CQS)** — Ne modifie jamais les artefacts qu'il revoit
- **Verdict structuré** — Approve ou reject, pas d'état intermédiaire
- Voir [Customisation]({{ "/fr/tutorials/customisation" | relative_url }}) pour la liste complète

## Pourquoi cette forme

Le reviewer est un agent en lecture seule. Cette contrainte n'est pas un choix de design arbitraire — c'est l'application directe de CQS : poser une question (« cet artefact est-il acceptable ? ») ne doit pas changer la réponse.

> « Asking a question should not change the answer. »
> — Meyer, B., *Object-Oriented Software Construction, 2nd ed.*, 1997.

La séparation stricte entre exécuteur et reviewer empêche les conflits d'intérêt : celui qui produit ne juge pas, celui qui juge ne produit pas.

## Customisation autorisée

- Critères de revue et seuils d'acceptation (L2)
- Format du verdict (L1)
- Nombre maximal de cycles reviewer (L2)

## Voir aussi

- [backlog-discoverer]({{ "/fr/reference/agents/backlog-discoverer" | relative_url }}) — Agent exécuteur associé
- [Pipeline DISCOVER]({{ "/fr/explanation/pipeline/discover" | relative_url }}) — Description de la phase
- [Concepts fondamentaux — CQS]({{ "/fr/explanation/concepts" | relative_url }}) — Principe sous-jacent
