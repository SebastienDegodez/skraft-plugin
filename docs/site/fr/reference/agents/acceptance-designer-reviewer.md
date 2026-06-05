---
layout: doc
lang: fr
title: "acceptance-designer-reviewer"
persona: tech-lead
---

# acceptance-designer-reviewer

> Revoit les scénarios BDD et le plan d'implémentation de la phase DISTILL, en vérifiant la couverture métier et la testabilité.

## Quand l'utiliser

- Phase DISTILL (revue), après l'acceptance-designer
- Dispatché automatiquement par l'orchestrateur
- Jamais invoqué directement par l'utilisateur

## Contrat d'entrée

- Fichiers `.feature` (scénarios Gherkin)
- Plan d'implémentation
- Critères d'acceptation de la story originale

## Contrat de sortie

- Verdict : approve ou reject avec justification
- En cas de rejet, liste des scénarios manquants ou mal formulés

## Invariants

- **Lecture seule (CQS)** — Ne modifie jamais les artefacts qu'il revoit
- **Verdict structuré** — Approve ou reject, pas d'état intermédiaire
- Voir [Customisation]({{ "/fr/tutorials/customisation" | relative_url }}) pour la liste complète

## Pourquoi cette forme

Le reviewer DISTILL vérifie que les scénarios couvrent les critères d'acceptation sans modifier les fichiers `.feature`. CQS s'applique : lire un scénario pour l'évaluer ne doit pas le transformer.

> « Asking a question should not change the answer. »
> — Meyer, B., *Object-Oriented Software Construction, 2nd ed.*, 1997.

La revue porte sur la couverture métier (tous les cas sont-ils couverts ?) et la qualité du Gherkin (les scénarios sont-ils compréhensibles par un expert métier ?).

## Customisation autorisée

- Critères de couverture minimale (L2)
- Format du verdict (L1)
- Nombre maximal de cycles reviewer (L2)

## Voir aussi

- [acceptance-designer]({{ "/fr/reference/agents/acceptance-designer" | relative_url }}) — Agent exécuteur associé
- [Pipeline DISTILL]({{ "/fr/explanation/pipeline/distill" | relative_url }}) — Description de la phase
- [Concepts fondamentaux — CQS]({{ "/fr/explanation/concepts" | relative_url }}) — Principe sous-jacent
