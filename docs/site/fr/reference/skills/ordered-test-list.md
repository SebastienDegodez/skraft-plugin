---
layout: doc
lang: fr
title: "ordered-test-list"
persona: tech-lead
---

# ordered-test-list

> Skill d'application DELIVER : progression stricte test-par-test avec TPP + FLFI.

## Quand l'utiliser

- Pendant DELIVER, quand l'implémentation suit des incréments TDD
- Avec [outside-in-tdd]({{ "/fr/reference/skills/outside-in-tdd" | relative_url }}) et [red-synthesize-green]({{ "/fr/reference/skills/red-synthesize-green" | relative_url }})
- Avant chaque édition de code prod, pour figer l'ordre des tests actifs

## Contrat d'entrée

- Liste ordonnée des tests pour la tranche de comportement active
- Un test actif identifié (`pending` → `red` → `green`)
- Suite acceptance/unit existante pour exécuter les régressions

## Contrat de sortie

- Test actif passé à `green` avec preuve d'exécution
- Curseur de la liste avancé vers le test suivant
- Régressions vertes avant de continuer

## Invariants

- **TPP** — Avancer avec plus petit pas de test suivant (constante, triangulation, frontière, erreur)
- **FLFI** — Premier test en échec = seule cible de correction active
- **Un seul test actif** — Pas de progression parallèle sur même incrément
- **Pas de réordonnancement caché** — L'ordre de la liste reste stable pendant la tranche active
- Voir [Customisation]({{ "/fr/how-to/customisation" | relative_url }}) pour la liste complète

## Pourquoi cette forme

Ordonnancement strict évite implémentation en lot et protège qualité du feedback. L'agent sait toujours quel test autorise le prochain changement de code.

## Customisation autorisée

- Granularité de liste ordonnée (niveau scénario vs niveau test) (L2)
- Portée de régression après chaque green (suite unique vs suite module) (L2)
- Seuil d'escalade si premier test en échec reste rouge (L1)

## Voir aussi

- [outside-in-tdd]({{ "/fr/reference/skills/outside-in-tdd" | relative_url }}) — Stratégie globale
- [red-synthesize-green]({{ "/fr/reference/skills/red-synthesize-green" | relative_url }}) — Mécanique RED/GREEN
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent utilisateur du skill
