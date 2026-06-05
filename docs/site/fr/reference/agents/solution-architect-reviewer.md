---
layout: doc
lang: fr
title: "solution-architect-reviewer"
persona: tech-lead
---

# solution-architect-reviewer

> Revoit les artefacts de la phase DESIGN et vérifie la cohérence architecturale, le respect de Clean Architecture et la pertinence des ADRs.

## Quand l'utiliser

- Phase DESIGN (revue), après le solution-architect
- Dispatché automatiquement par l'orchestrateur
- Jamais invoqué directement par l'utilisateur

## Contrat d'entrée

- ADRs, diagrammes de composants, Event Model
- Critères de qualité architecturale (Clean Architecture, DDD)

## Contrat de sortie

- Verdict : approve ou reject avec justification
- En cas de rejet, liste des violations architecturales identifiées

## Invariants

- **Lecture seule (CQS)** — Ne modifie jamais les artefacts qu'il revoit
- **Verdict structuré** — Approve ou reject, pas d'état intermédiaire
- Voir [Customisation]({{ "/fr/tutorials/customisation" | relative_url }}) pour la liste complète

## Pourquoi cette forme

Le reviewer architectural applique CQS : il consulte les artefacts sans les modifier. Cette contrainte empêche le reviewer de « patcher » silencieusement une architecture bancale — il doit la rejeter explicitement.

> « Asking a question should not change the answer. »
> — Meyer, B., *Object-Oriented Software Construction, 2nd ed.*, 1997.

La revue vérifie que les frontières architecturales (bounded contexts, layers) sont respectées, pas que le code compile.

## Customisation autorisée

- Critères de revue architecturale (L2)
- Format du verdict (L1)
- Nombre maximal de cycles reviewer (L2)

## Voir aussi

- [solution-architect]({{ "/fr/reference/agents/solution-architect" | relative_url }}) — Agent exécuteur associé
- [Pipeline DESIGN]({{ "/fr/explanation/pipeline/design" | relative_url }}) — Description de la phase
- [Concepts fondamentaux — CQS]({{ "/fr/explanation/concepts" | relative_url }}) — Principe sous-jacent
