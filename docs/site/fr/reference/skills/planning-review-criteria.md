---
layout: doc
lang: fr
title: "planning-review-criteria"
description: "Use when reviewing DISCUSS artefacts (stories, acceptance criteria, sprint plans) for INVEST quality, planning cohere..."
persona: tech-lead
---

# planning-review-criteria

> Définitions formelles des gates et rubrique de verdict pour le `backlog-planner-reviewer`, couvrant 4 lenses et 8 gates (G1–G8) sur les artefacts DISCUSS.

## Quand l'utiliser

- Reviewer les artefacts DISCUSS (stories, critères d'acceptation, plans de sprint)
- Évaluer la qualité INVEST, la cohérence de planification, et la conformité DoR
- Appliquer les 4 lenses : `invest-lens`, `ac-quality-lens`, `planning-coherence-lens`, `dor-compliance-lens`
- Dériver un verdict : `approved`, `changes_requested`, ou `rejected`

## Contrat d'entrée

- Artefacts DISCUSS : stories, fichiers `ac-draft-{story}.md`, plan de sprint
- Rapport de triage DISCOVER (contexte, pas bloquant si absent)

## Contrat de sortie

- Verdict par story (`approved` / `changes_requested` / `rejected`)
- Findings classifiés par gate (G1–G8) et sévérité (BLOCKER / HIGH / MEDIUM / LOW)
- Niveau de confiance (`high` / `medium` / `low`) selon la complétude des artefacts
- Recommandations de remédiation pour chaque finding

## Invariants

- **≥ 1 finding BLOCKER → verdict `rejected`** — sans exception
- **≥ 1 finding HIGH, 0 BLOCKER → verdict `changes_requested`** — minimum
- **G4 et G6 sont des BLOCKERs automatiques** — ambiguïté des ACs et cycle de dépendances
- **G7 : 2+ items DoR manquants sur la même story → `rejected`** — indépendamment des autres findings
- **G8 antipatterns CRITIQUES** (Implement-X, Giant Stories, No Examples) → `rejected` automatique
- **Vocabulaire de domaine obligatoire** dans les ACs — codes HTTP, verbes REST, noms de classes sont des violations G4

## Pourquoi cette forme

Le reviewer applique 4 lenses indépendantes pour éviter les angles morts : INVEST vérifie l'indépendance et la valeur, AC Quality vérifie l'ambiguïté et la complétude, Planning Coherence vérifie la cohérence du milestone et les cycles de dépendances, DoR Compliance vérifie les 8 items du Definition of Ready et les 8 antipatterns.

> « A story that passes all 8 gates is approved to enter DESIGN. A story with any blocking finding must return to DISCUSS. »

La table de dérivation du verdict transforme les findings en une décision claire et reproductible, indépendante du jugement subjectif du reviewer.

## Customisation autorisée

- Seuil minimum d'ACs par story (défaut : 3) (L1)
- Labels d'antipatterns supplémentaires (L2)
- Règles de détection de cycle de dépendances (L2)

## Voir aussi

- [issue-refinement]({{ "/fr/reference/skills/issue-refinement" | relative_url }}) — Produit les artefacts DISCUSS évalués par ce skill
- [bdd-methodology]({{ "/fr/reference/skills/bdd-methodology" | relative_url }}) — Format Gherkin référencé par les gates G3 et G4
- [backlog-planner-reviewer]({{ "/fr/reference/agents/backlog-planner-reviewer" | relative_url }}) — Agent reviewer qui utilise ce skill
- [backlog-planner]({{ "/fr/reference/agents/backlog-planner" | relative_url }}) — Agent DISCUSS dont les artefacts sont reviewés ici
