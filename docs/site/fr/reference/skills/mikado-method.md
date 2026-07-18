---
layout: doc
lang: fr
title: "mikado-method"
description: "Refactorer du code IN PLACE via la boucle Mikado : tenter naïvement, capturer ce qui casse comme prérequis, revert, implémenter bottom-up depuis les feuilles."
persona: tech-lead
---

# mikado-method

> Une discipline pour restructurer du code dont le graphe de dépendances réel n'est pas connaissable à l'avance : essaie, laisse le compilateur et les tests révéler les dépendances, revert, puis construit les prérequis bottom-up.

## Quand l'utiliser

- Changement sur place risquant de casser de façon difficile à prévoir
- Chargé en interne par [brownfield-refactorer]({{ "/fr/reference/agents/brownfield-refactorer" | relative_url }}) quand l'humain choisit la restructuration sur place plutôt que Strangler Fig

## Précondition

Un filet de sécurité vert doit exister ([characterize-with-contracts]({{ "/fr/reference/skills/characterize-with-contracts" | relative_url }}) / [brownfield-harness-builder]({{ "/fr/reference/agents/brownfield-harness-builder" | relative_url }})). Une couverture faible produit de fausses feuilles ; gate CONCERNS/FAIL → renforcer le harness d'abord.

## Les quatre primitives (appliquer exactement)

1. **Goal** — une phrase concrète orientée valeur métier, validée avec l'humain (rejeter les objectifs vagues)
2. **Naive experiment** — worktree isolé, tenter le plus évidemment, lancer build + suite complète ; c'est un CAPTEUR, jamais un brouillon
3. **Visualize** — chaque échec est un prérequis → noeud du graphe avec arête vers le goal ; citer `file:line` + message
4. **Undo** — jeter le worktree entièrement ; jamais `git stash`, jamais garder du code « presque marchant » ; le revert est gratuit

## Contrat de sortie

- Graphe persistant Mermaid `graph TD` : `mikado-<slug>.md` (noeuds `observed` vs `anticipated`)
- Feuilles implémentées une à une sur la vraie branche, commit vert après chacune

## Invariants

- **La feuille = prérequis sans enfant non implémenté** — jamais démarrer un parent avant ses enfants
- **Le graphe est l'artefact** — recharger à chaque frontière de re-grounding, jamais le recall
- **observed vs anticipated** — confirmer une hypothèse par une vraie tentative avant de la traiter en prérequis
- **Un spawn `refactoring-worker` par feuille** — signaux `ADVANCE`/`EXPAND`/`DONE`/`BLOCKED`

## Pourquoi cette forme

Le graphe survit entre itérations ; le code de l'expérience échouée est toujours jeté. Mikado ne fonctionne qu'avec un filet de sécurité — sans tests, rien ne casse parce que rien n'est vérifié, pas parce que rien n'en dépend.

> « The main thing that distinguishes legacy code from non-legacy code is tests, or rather a lack of tests. »
> — Feathers, M., *Working Effectively with Legacy Code*, 2004.

## Customisation autorisée

- Classes de noeuds du graphe (`observed` / `anticipated`)
- Granularité des feuilles dispatchées au worker

## Voir aussi

- [brownfield-refactorer]({{ "/fr/reference/agents/brownfield-refactorer" | relative_url }}) — Agent qui charge ce skill et pilote la boucle
- [refactoring-worker]({{ "/fr/reference/workers/refactoring-worker" | relative_url }}) — Implémente chaque feuille dans un contexte frais
- [strangler-fig-method]({{ "/fr/reference/skills/strangler-fig-method" | relative_url }}) — Stratégie alternative (remplacement plutôt que restructuration)
- [characterize-with-contracts]({{ "/fr/reference/skills/characterize-with-contracts" | relative_url }}) — Précondition : le filet de sécurité vert
- [Brownfield]({{ "/fr/explanation/brownfield" | relative_url }}) — Vue d'ensemble de la famille
