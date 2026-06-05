---
layout: doc
lang: fr
title: "backlog-planner"
persona: tech-lead
---

# backlog-planner

> Affine les issues triées en stories structurées avec critères d'acceptation, selon les principes INVEST.

## Quand l'utiliser

- Phase DISCUSS du pipeline
- Après validation du triage par le backlog-discoverer-reviewer
- Trigger : dispatch par l'orchestrateur

## Contrat d'entrée

- Issue triée et approuvée (rapport de triage validé)
- Contexte du projet (stories existantes, milestone)

## Contrat de sortie

- Story affinée au format user story avec critères d'acceptation
- Estimation d'effort et assignation de milestone
- Gate DoR (Definition of Ready) passée

## Invariants

- **Qualité INVEST** — Chaque story est Independent, Negotiable, Valuable, Estimable, Small, Testable
- **Gate DoR** — 8 critères à valider avant de passer à DESIGN
- Voir [Customisation]({{ "/fr/customisation" | relative_url }}) pour la liste complète

## Pourquoi cette forme

Le planner traite le scope, le temps et la qualité comme des variables conscientes. Chaque story est dimensionnée pour être livrable en un cycle complet du pipeline — pas plus, pas moins.

> « The best XP teams treat scope, time, cost, and quality as variables to be consciously managed. »
> — Beck, K., *Extreme Programming Explained, 2nd ed.*, 2004.

Les critères INVEST garantissent que chaque story est testable et indépendante, condition nécessaire pour que le pipeline fonctionne en flux.

## Customisation autorisée

- Template de story et critères d'acceptation (L1)
- Seuils de taille et d'effort (L2)
- Critères DoR additionnels (L2)

## Voir aussi

- [backlog-planner-reviewer]({{ "/fr/reference/agents/backlog-planner-reviewer" | relative_url }}) — Revue des artefacts DISCUSS
- [Pipeline DISCUSS]({{ "/fr/pipeline/discuss" | relative_url }}) — Description de la phase
- [solution-architect]({{ "/fr/reference/agents/solution-architect" | relative_url }}) — Phase suivante (DESIGN)
