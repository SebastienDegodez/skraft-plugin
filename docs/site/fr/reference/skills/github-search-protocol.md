---
layout: doc
lang: fr
title: "github-search-protocol"
description: "Use when building GitHub search queries, paginating through issue results, filtering by labels/milestones/assignees, ..."
persona: tech-lead
---

# github-search-protocol

> Protocole structuré pour découvrir des issues GitHub via trois modes : assignation utilisateur, découverte pilotée par artefacts, et exploration par recherche.

## Quand l'utiliser

- Construire des requêtes GitHub Search précises avec 3–5 qualificateurs
- Paginer à travers des résultats d'issues, filtrer par labels, milestones, assignees
- Implémenter la découverte pilotée par artefacts à partir de l'historique git
- Découvrir les issues liées à une zone de code en cours de modification

## Contrat d'entrée

- Accès à l'outil MCP `mcp_github_search_issues`
- Un intent de découverte (mode 1, 2 ou 3)
- Pour le mode 2 : historique git récent (`git log --since="7 days ago"`)

## Contrat de sortie

- Liste d'issues triées et filtrées avec les champs : `number`, `title`, `labels`, `milestone`, `assignees`, `updated_at`
- Requête construite documentée (qualificateurs utilisés)
- Pagination si `total_count` > `per_page`

## Invariants

- **Signal, pas bruit** — Une requête bien formée avec 3–5 qualificateurs surpasse une requête large avec filtrage post-hoc
- **Trois modes** — User-assigned / Artifact-driven / Search-based — chaque mode a son propre pattern de requête
- **Cap à 20 résultats** pour la qualité du triage
- **Mots-clés de domaine uniquement** — Filtrer les noms d'infrastructure (`Controller`, `Repository`, `Service`, `Handler`, `Test`) — ce sont de la plomberie, pas du signal domaine

## Pourquoi cette forme

La découverte efficace d'issues repose sur la précision de la requête, pas sur le volume de résultats. En mode 2 (artifact-driven), les mots-clés sont extraits des chemins de fichiers modifiés en appliquant des heuristiques PascalCase/camelCase, puis filtrés pour ne conserver que les noms de domaine — `Eligibility`, `Driver`, `Policy` — plutôt que des termes techniques.

> « Les trois modes s'adressent à des intentions de découverte différentes : ce qui m'est assigné, ce qui est lié à ce que je modifie, et l'exploration d'un thème. »

## Customisation autorisée

- Seuil de cap des résultats (défaut : 20)
- Termes d'infrastructure à exclure en mode 2 (L1)
- Heuristiques de classement des résultats (L2)

## Voir aussi

- [issue-triage]({{ "/fr/reference/skills/issue-triage" | relative_url }}) — Classification et priorisation des issues découvertes
- [issue-refinement]({{ "/fr/reference/skills/issue-refinement" | relative_url }}) — Transformation des issues en user stories INVEST
- [backlog-discoverer]({{ "/fr/reference/agents/backlog-discoverer" | relative_url }}) — Agent qui active ce skill en phase DISCOVER
