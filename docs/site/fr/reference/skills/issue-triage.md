---
layout: doc
lang: fr
title: "issue-triage"
description: "Use when triaging GitHub issues by assigning labels, priority, effort estimates, or detecting duplicates. Covers tria..."
persona: tech-lead
---

# issue-triage

> Assigne des métadonnées structurées aux issues GitHub (type, priorité, effort, doublons) pour permettre à la phase DISCUSS de les raffiner dans l'ordre de priorité.

## Quand l'utiliser

- Classifier des issues GitHub nouvellement créées (`status/needs-triage`)
- Assigner des labels de type, priorité, et effort à une issue
- Détecter les doublons et les issues liées
- Construire une proposition de sprint avec capacité calculée
- Signaler les issues XL qui doivent être découpées avant d'entrer en DISCUSS

## Contrat d'entrée

- Liste d'issues GitHub avec titre et description
- Accès à l'outil MCP `mcp_github_issue_write` pour appliquer les labels

## Contrat de sortie

- Tableau de triage avec : numéro, titre, type, priorité, effort, notes
- Labels appliqués sur chaque issue : `type/*`, `priority/*`, `effort/*`, `status/ready` ou `status/duplicate`
- Proposition de sprint avec capacité calculée
- Notes « must split » pour chaque issue `effort/XL`

## Invariants

- **Le triage est une classification, pas un refinement** — On n'écrit pas de critères d'acceptation ici
- **Toute issue triée doit avoir** un type, une priorité, et un effort avant d'être `status/ready`
- **P0 requiert une justification écrite** — champ Notes obligatoire : raison, impact, date
- **XL doit être signalé** — Toute issue `effort/XL` bloque l'entrée en DISCUSS sans plan de découpage
- **Taxonomie de labels fixe** — `type/feature`, `type/bug`, `type/tech-debt`, `type/docs`, `type/question` pour les types ; `priority/P0–P3` pour la priorité ; `effort/XS–XL` pour l'effort

## Pourquoi cette forme

Le triage établit une discipline de classification avant tout travail de refinement. Séparer la classification (DISCOVER) du refinement (DISCUSS) évite de gaspiller de l'énergie à raffiner des issues de faible priorité ou des doublons. L'arbre de décision de priorité (P0 → P1 → P2 → P3) garantit une cohérence entre les équipes.

> « Triage is classification, not refinement. You are labeling, prioritizing, and estimating to enable the next phase. »

La détection de doublons par normalisation des titres (lowercase, suppression des stop words, tri alphabétique, ratio d'overlap) réduit le bruit dans le backlog sans perdre le contexte des issues originales.

## Customisation autorisée

- Labels de zone (`area/*`) (L1)
- Seuils de similarité pour la détection de doublons (L2)
- Conversion effort-en-jours pour la capacité du sprint (L2)

## Voir aussi

- [github-search-protocol]({{ "/fr/reference/skills/github-search-protocol" | relative_url }}) — Découverte des issues avant triage
- [issue-refinement]({{ "/fr/reference/skills/issue-refinement" | relative_url }}) — Phase DISCUSS : transformation en user stories après triage
- [discovery-review-criteria]({{ "/fr/reference/skills/discovery-review-criteria" | relative_url }}) — Gates G1–G6 qui évaluent la qualité du triage
- [backlog-discoverer]({{ "/fr/reference/agents/backlog-discoverer" | relative_url }}) — Agent DISCOVER qui utilise ce skill
