---
layout: doc
lang: fr
title: "ordered-test-list"
description: "Use when starting any non-trivial feature, fix, or refactoring with TDD: plan an ORDERED test list (BDD semantics + TPP transformation + logical contradiction) before any production code, then execute it one test at a time."
persona: tech-lead
---

# ordered-test-list

> Avant toute ligne de code applicatif : une liste de tests ordonnée sur les trois niveaux de la pyramide, chaque entrée portant sa transformation TPP et la contradiction logique qui la justifie.

## Quand l'utiliser

- En début de phase DELIVER, avant le premier RED — la planification précède le code
- Dès qu'une fonctionnalité est complexe et que la tentation est de générer le code en bloc
- En complément de [outside-in-tdd]({{ "/fr/reference/skills/outside-in-tdd" | relative_url }}) (niveaux et frontières) et de [red-synthesize-green]({{ "/fr/reference/skills/red-synthesize-green" | relative_url }}) (mécanique du cycle)

## Contrat d'entrée

- Comportement attendu : scénario Gherkin, story INVEST ou rapport de bug
- Test d'acceptation extérieur déjà écrit en DISTILL (il reste RED)
- Code existant (éventuellement vide)

## Contrat de sortie

- Liste de tests ordonnée, persistée dans `.copilot-tracking/skraft-plans/{projectSlug}/details/{date}/test-list-{story}.md`
- Pour chaque entrée : niveau (unit / integration / e2e), sémantique BDD, transformation TPP, contradiction logique
- Un journal de re-planification lorsque l'ordre évolue en cours de route

## Invariants

- **Planification d'abord** — aucun code de production avant que la liste n'existe par écrit
- **Un test à la fois** — la liste se consomme par la tête, jamais en parallèle
- **Transformation déclarée** — le GREEN applique exactement la transformation TPP prévue, rien de plus
- **Contradiction obligatoire** — une entrée sans contradiction logique est un test redondant : on la supprime
- **Re-planification tracée** — réordonner est permis, réordonner en silence ne l'est pas

## Pourquoi cette forme

La TPP classe les transformations du code de la plus simple à la plus complexe. Choisir à chaque étape la transformation la plus haute dans la liste empêche le saut de conception : le design émerge par accumulation de micro-pas plutôt que par anticipation.

> « As the tests get more specific, the code gets more generic. »
> — Martin, R. C., *The Transformation Priority Premise*, 2013.

L'ordre des tests n'est donc pas un détail d'organisation : c'est lui qui décide de la séquence dans laquelle la conception a le droit d'apparaître. La liste écrite rend cet ordre auditable — et la règle FLFI (Failing, Least, Fast, Incremental) le rend décidable : cas dégénérés d'abord, cas général atteint par accumulation.

> « The two rules of TDD: write new code only if an automated test has failed; eliminate duplication. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

## Pièges & anti-patterns

- Écrire la liste **après** l'implémentation pour la documenter : c'est du retro-fitting
- Ouvrir deux RED simultanés (hors test d'acceptation extérieur laissé rouge volontairement)
- Implémenter au passage ce qu'une entrée ultérieure demandera
- Fusionner deux entrées « pour gagner un cycle » : la contradiction disparaît, le design cesse d'émerger

## Customisation autorisée

- Granularité des entrées (une entrée = un slice de comportement) (L2)
- Répartition entre niveaux unit / integration / e2e (L2)
- Emplacement de l'artefact liste de tests (L1)

## Voir aussi

- [outside-in-tdd]({{ "/fr/reference/skills/outside-in-tdd" | relative_url }}) — Niveaux de la pyramide et frontières
- [red-synthesize-green]({{ "/fr/reference/skills/red-synthesize-green" | relative_url }}) — Mécanique RED → GREEN de chaque entrée
- [test-design-mandates]({{ "/fr/reference/skills/test-design-mandates" | relative_url }}) — Quels cas méritent un test
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent qui produit et consomme la liste
