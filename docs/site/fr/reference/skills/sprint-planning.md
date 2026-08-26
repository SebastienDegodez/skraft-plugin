---
layout: doc
lang: fr
title: "sprint-planning"
description: "Use when planning sprint content, prioritizing stories within milestones, estimating capacity, or analyzing dependenc..."
persona: tech-lead
---

# sprint-planning

> Décide le contenu d'un sprint : quelles stories entrent dans le milestone, leur priorité MoSCoW, la capacité disponible et l'ordre de séquencement par dépendances.

## Quand l'utiliser

- Après validation DoR de toutes les stories du backlog (sortie de DISCUSS)
- Pour construire ou affiner le contenu d'un milestone GitHub
- Pour analyser les graphes de dépendances entre stories et détecter les cycles DAG

## Contrat d'entrée

- Liste de stories approuvées DoR depuis DISCUSS
- Taille d'équipe et durée de sprint connues
- Estimations en points Fibonacci par story (`1`, `2`, `3`, `5`, `8`)

## Contrat de sortie

- Stories labelisées MoSCoW (`priority/must`, `priority/should`, `priority/could`, `priority/wont`)
- Milestone GitHub créé avec titre `v{major}.{minor}-{theme}`, description et date d'échéance
- Graphe de dépendances DAG validé (sans cycle)
- Capacité de sprint vérifiée (total story-days ≤ charge viable)

## Invariants

- **Must-Haves ≤ 60 % de la capacité** — pas de sprint surchargé de Must
- **Should-Haves ≤ 30 %** — les Could-Haves occupent le reliquat
- **Au-delà de 8 points bloqué** — une story de 13 ou 21 points doit être découpée avant d'entrer dans le sprint
- **DAG sans cycle** — une dépendance circulaire bloque la planification et doit être résolue
- **3 à 8 stories par milestone** — en dehors de cette fourchette, réviser le périmètre
- **Capacité viable = équipe × durée × 0,7** — le facteur intègre réunions, revues PR et imprévus

## Pourquoi cette forme

Le sprint planning répond à trois questions dans l'ordre : Quoi ? Combien ? Dans quel ordre ? La priorisation MoSCoW sépare explicitement la valeur du confort, et le DAG révèle l'ordre de livraison naturel sans décision arbitraire.

> « Clean code reads like well-written prose. »
> — Martin, R. C., *Clean Code*, 2008.

Un sprint bien planifié protège la cadence : couper les Could-Haves est une décision prévisible, pas une urgence.

## Customisation autorisée

- Mapping points vers story-days (L1)
- Facteur de capacité viable (par défaut 0,7) (L2)
- Convention de nommage des milestones (`v{major}.{minor}-{theme}`) (L1)

## Voir aussi

- [issue-refinement]({{ "/fr/reference/skills/issue-refinement" | relative_url }}) — Raffinage des stories (DoR)
- [issue-triage]({{ "/fr/reference/skills/issue-triage" | relative_url }}) — Triage des issues entrantes
- [backlog-planner]({{ "/fr/reference/agents/backlog-planner" | relative_url }}) — Agent DISCUSS qui utilise ce skill
