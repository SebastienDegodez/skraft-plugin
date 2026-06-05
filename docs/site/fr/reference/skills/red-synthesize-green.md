---
layout: doc
lang: fr
title: "red-synthesize-green"
persona: tech-lead
---

# red-synthesize-green

> Cycle d'implémentation TDD : RED (test qui échoue) → GREEN (implémentation minimale) → REFACTOR (nettoyage sans régression).

## Quand l'utiliser

- Pendant la phase DELIVER, pour chaque incrément de code
- En combinaison avec [outside-in-tdd]({{ "/fr/reference/skills/outside-in-tdd" | relative_url }}) pour la stratégie globale
- Avant chaque checkpoint [craft-discipline]({{ "/fr/reference/skills/craft-discipline" | relative_url }})

## Contrat d'entrée

- Test d'acceptation ou test unitaire à faire passer
- Code existant (peut être vide au premier cycle)

## Contrat de sortie

- Test passant (GREEN)
- Code refactoré sans régression
- Prêt pour le prochain cycle RED

## Invariants

- **RED obligatoire** — On n'écrit du code que si un test échoue
- **GREEN minimal** — L'implémentation la plus simple qui fait passer le test
- **REFACTOR sans régression** — Le refactoring ne casse aucun test existant
- Voir [Customisation]({{ "/fr/tutorials/customisation" | relative_url }}) pour la liste complète

## Pourquoi cette forme

Le cycle RED-GREEN-REFACTOR est le rythme fondamental du TDD. Chaque micro-itération produit un incrément vérifié — le feedback est immédiat.

> « The two rules of TDD: write new code only if an automated test has failed; eliminate duplication. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

La phase RED est un diagnostic : si le test passe immédiatement, soit le test est trivial, soit le code fait déjà plus que nécessaire. La phase GREEN est une synthèse : on écrit le code minimal. La phase REFACTOR est un nettoyage : on élimine la duplication sans changer le comportement.

> « Refactoring is the process of changing a software system in such a way that it does not alter the external behavior of the code. »
> — Fowler, M., *Refactoring, 2nd ed.*, 2018.

## Customisation autorisée

- Taille des incréments (micro vs macro) (L2)
- Règles de refactoring autorisées (L2)
- Fréquence des commits (L1)

## Voir aussi

- [outside-in-tdd]({{ "/fr/reference/skills/outside-in-tdd" | relative_url }}) — Stratégie TDD globale
- [craft-discipline]({{ "/fr/reference/skills/craft-discipline" | relative_url }}) — Checkpoints d'auto-discipline
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent qui utilise ce skill
