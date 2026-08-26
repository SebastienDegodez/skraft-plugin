---
layout: doc
lang: fr
title: "issue-refinement"
description: "Use when transforming raw issues or feature requests into well-structured user stories with acceptance criteria. Cove..."
persona: tech-lead
---

# issue-refinement

> Transforme les issues GitHub brutes ou demandes de fonctionnalités en user stories structurées avec des critères d'acceptation, appliqué en phase DISCUSS.

## Quand l'utiliser

- Transformer une issue brute en user story implémentable
- Vérifier la conformité INVEST d'une story existante
- Détecter les 8 antipatterns de stories (Implement-X, Vague Persona, etc.)
- Appliquer un pattern de découpage (par workflow, règle métier, variation de données, interface, AC, chemin happy/sad)
- Valider les 8 items du DoR (Definition of Ready) avant d'entrer en phase DESIGN

## Contrat d'entrée

- Issue GitHub brute ou story en cours de rédaction
- Triée et priorisée (issue ayant passé la phase DISCOVER)

## Contrat de sortie

- User story au format `As a {persona}, I want {capability}, so that {benefit}`
- ≥ 3 critères d'acceptation en Given/When/Then ou liste à puces
- DoR 8 items validés
- Effort estimé en points Fibonacci (1, 2, 3, 5, 8 — 13 et 21 interdits sans découpage)

## Invariants

- **La story est une unité de valeur** — Une story N'EST PAS une tâche, un ticket, ou une instruction technique
- **Persona spécifique** — jamais « un utilisateur », « quelqu'un » ou « le système »
- **Capacité = comportement observable** — jamais `implement`, `create`, `call`, `build` en tant que capability
- **Au-delà de 8 points = doit être découpée avant DoR** — Toute story estimée 13 ou 21 ne peut pas atteindre le statut `status/ready`
- **6 critères INVEST** — Independent, Negotiable, Valuable, Estimable, Small, Testable — tous doivent passer

## Pourquoi cette forme

La phase DISCUSS produit des stories, pas des spécifications techniques. Une story bien formée aligne l'équipe sur la valeur à livrer sans prescrire l'implémentation. Les critères d'acceptation dérivés d'exemples domaine assurent que le comportement attendu peut être validé par un expert métier sans connaissance du code.

> « The goal of refinement is shared understanding, not a perfect document. »

Les 6 patterns de découpage (par étape de workflow, règle métier, variation de données, interface, AC, chemin happy/sad) permettent de réduire toute story de 13 ou 21 points en stories de 2 à 5 points indépendamment livrables.

## Customisation autorisée

- Template d'user story (L1)
- Patterns de découpage additionnels (L2)
- Seuil minimum d'ACs (défaut : 3) (L2)

## Voir aussi

- [issue-triage]({{ "/fr/reference/skills/issue-triage" | relative_url }}) — Phase DISCOVER : classification avant refinement
- [planning-review-criteria]({{ "/fr/reference/skills/planning-review-criteria" | relative_url }}) — Gates G1–G8 qui évaluent la qualité des stories produites
- [bdd-methodology]({{ "/fr/reference/skills/bdd-methodology" | relative_url }}) — Format Gherkin pour les critères d'acceptation
- [backlog-planner]({{ "/fr/reference/agents/backlog-planner" | relative_url }}) — Agent DISCUSS qui utilise ce skill
