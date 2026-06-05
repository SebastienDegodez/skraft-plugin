---
layout: doc
lang: fr
title: "craft-discipline"
persona: tech-lead
---

# craft-discipline

> Checkpoints d'auto-discipline que l'ingénieur exécute après chaque phase TDD, avant de considérer le travail terminé.

## Quand l'utiliser

- Après avoir complété une phase TDD (RED, GREEN, REFACTOR)
- Avant de soumettre le code au reviewer
- Comme checklist personnelle, pas comme contrat de revue

## Contrat d'entrée

- Code et tests en cours d'implémentation
- Phase TDD identifiée (RED, GREEN ou REFACTOR)

## Contrat de sortie

- Checklist validée par l'ingénieur lui-même
- Confiance que le livrable est prêt pour la revue

## Invariants

- **Auto-évaluation, pas revue** — Ce skill est un checkpoint personnel, le reviewer vérifie indépendamment
- **Pas de raccourci** — Chaque item de la checklist est vérifié, pas « globalement OK »
- Voir [Customisation]({{ "/fr/customisation" | relative_url }}) pour la liste complète

## Pourquoi cette forme

La discipline de craft est une hygiène personnelle. Un code propre n'est pas un code qui a survécu à une revue — c'est un code que l'auteur a consciemment vérifié avant de le soumettre.

> « Clean code reads like well-written prose. »
> — Martin, R. C., *Clean Code*, 2008.

L'auto-discipline réduit le bruit dans les cycles de revue : le reviewer peut se concentrer sur les vrais problèmes plutôt que sur des oublis triviaux.

> « The two rules of TDD: write new code only if an automated test has failed; eliminate duplication. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

## Customisation autorisée

- Items de la checklist (L1)
- Seuils de qualité (complexité, duplication) (L2)
- Fréquence des checkpoints (L2)

## Voir aussi

- [red-synthesize-green]({{ "/fr/reference/skills/red-synthesize-green" | relative_url }}) — Cycle TDD
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent qui utilise ce skill
- [software-engineer-reviewer]({{ "/fr/reference/agents/software-engineer-reviewer" | relative_url }}) — Le reviewer qui vérifie indépendamment
