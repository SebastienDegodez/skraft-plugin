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

## Structure du skill

Quatre fichiers, pas un seul :

- `SKILL.md` — boucle, format minimal du graphe, gate de validation
- `references/graph-format.md` — spec annotée complète (marqueurs, arêtes `requires:`, gate golden-master), chargée à la demande
- `references/worked-example.md` — trace complète d'un cycle, chargée à la demande
- `scripts/validate-mikado.sh` — validateur Bash déterministe à 8 passes, **inspiré du** validateur de [chaabani-anis/mikado-method](https://github.com/chaabani-anis/mikado-method) (licence MIT) mais **réimplémenté** pour parser le format Mermaid `graph TD` propre à SKRAFT — pas le format texte en rail-notation de ce projet ; ce n'est pas une copie verbatim

## Précondition

Un filet de sécurité vert doit exister ([characterize-with-contracts]({{ "/fr/reference/skills/characterize-with-contracts" | relative_url }}) / [brownfield-harness-builder]({{ "/fr/reference/agents/brownfield-harness-builder" | relative_url }})). Une couverture faible produit de fausses feuilles ; gate CONCERNS/FAIL → renforcer le harness d'abord.

## Les quatre primitives (appliquer exactement)

1. **Goal** — une phrase concrète orientée valeur métier, validée avec l'humain (rejeter les objectifs vagues)
2. **Naive experiment** — worktree isolé, tenter le plus évidemment, lancer build + suite complète ; c'est un CAPTEUR, jamais un brouillon
3. **Visualize** — chaque échec est un prérequis → noeud du graphe avec arête vers le goal ; citer `file:line` + message
4. **Undo** — jeter le worktree entièrement ; jamais `git stash`, jamais garder du code « presque marchant » ; le revert est gratuit

## Contrat de sortie

- Graphe persistant : `.copilot-tracking/skraft-plans/{projectSlug}/refactoring/{YYYY-MM-DD}/mikado-<slug>.md`, Mermaid `graph TD`, noeuds marqués `[ ]`/`[x]` (pending/done), classes `observed` vs `anticipated`
- Arêtes `-.requires.->` en pointillés pour les prérequis partagés entre plusieurs parents — le graphe est un vrai DAG, pas seulement un arbre
- Une gate golden-master obligatoire : soit un noeud dont le libellé mentionne « Golden Master », soit un commentaire Mermaid explicite `%% no-golden-master: <raison>`
- Feuilles implémentées une à une sur la vraie branche, commit vert après chacune
- Signaux terminaux vers `brownfield-refactorer` : `ADVANCE` / `EXPAND` / `DONE` / `BLOCKED`

## Validation obligatoire (8 passes)

```bash
bash plugins/skraft-framework/skills/mikado-method/scripts/validate-mikado.sh <path-to-graph.md>
```

À exécuter avant chaque commit de feuille et après chaque commit de mise à jour du graphe. Exit 0 requis pour continuer — jamais avancer sur un graphe non validé.

1. **Parse** — noeuds, arêtes, classes
2. **Traçabilité** — chaque noeud non-goal porte `discovered:` + `error:`, sauf `anticipated`
3. **Validation des références `requires:`** — toute arête doit résoudre vers un noeud défini
4. **Détection de cycle** — arbre + arêtes `requires:`
5. **Direction de l'arbre (ancestry via git)** — le commit `discovered:` de l'enfant doit être ancêtre-ou-égal à celui du parent, message conforme au préfixe `refactor(mikado-graph): <what>` ; gate avec `--no-git` pour les fixtures
6. **Détection d'orphelins** (avertissement seulement)
7. **Gate golden-master** — noeud « Golden Master » ou `%% no-golden-master: <raison>`
8. **Énumération des vraies feuilles** — prêtes pour le prochain dispatch

## Invariants

- **La feuille = prérequis sans enfant non implémenté** — jamais démarrer un parent avant ses enfants
- **Le graphe est l'artefact** — recharger à chaque frontière de re-grounding, jamais le recall
- **observed vs anticipated** — confirmer une hypothèse par une vraie tentative avant de la traiter en prérequis
- **`requires:` = DAG, pas arbre** — un prérequis partagé entre deux parents est un lien croisé, jamais dupliqué
- **Gate golden-master avant la première feuille** — noeud « Golden Master » ou déclaration `no-golden-master` explicite, sinon le validateur bloque
- **Un spawn `refactoring-worker` par feuille** — signaux `ADVANCE`/`EXPAND`/`DONE`/`BLOCKED`

## Pourquoi cette forme

Le graphe survit entre itérations ; le code de l'expérience échouée est toujours jeté. Mikado ne fonctionne qu'avec un filet de sécurité — sans tests, rien ne casse parce que rien n'est vérifié, pas parce que rien n'en dépend.

> « The main thing that distinguishes legacy code from non-legacy code is tests, or rather a lack of tests. »
> — Feathers, M., *Working Effectively with Legacy Code*, 2004.

## Customisation autorisée

- Classes de noeuds du graphe (`observed` / `anticipated`)
- Granularité des feuilles dispatchées au worker

## Voir aussi

- [characterize-with-contracts]({{ "/fr/reference/skills/characterize-with-contracts" | relative_url }}) — Précondition : le filet de sécurité vert
- [strangler-fig-method]({{ "/fr/reference/skills/strangler-fig-method" | relative_url }}) — Stratégie alternative (remplacement plutôt que restructuration)
- [brownfield-refactorer]({{ "/fr/reference/agents/brownfield-refactorer" | relative_url }}) — Agent qui charge ce skill et pilote la boucle
- [refactoring-worker]({{ "/fr/reference/workers/refactoring-worker" | relative_url }}) — Implémente chaque feuille dans un contexte frais
- [Brownfield]({{ "/fr/explanation/brownfield" | relative_url }}) — Vue d'ensemble de la famille
