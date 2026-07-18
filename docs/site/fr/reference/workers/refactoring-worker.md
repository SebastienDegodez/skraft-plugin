---
layout: doc
lang: fr
title: "refactoring-worker"
description: "[Worker interne — dispatché par brownfield-refactorer uniquement] Pilote une seule feuille Mikado ou tranche Strangler jusqu'à un état terminal dans un contexte frais isolé."
persona: brownfield-refactorer
---

# refactoring-worker

> Worker interne dispatché par `brownfield-refactorer` : traite exactement UN item — une feuille Mikado ou une tranche Strangler — par invocation, dans un contexte frais sans mémoire des items précédents.

## Quand il s'active

Dispatché par `brownfield-refactorer` pour piloter un unique item de refactor jusqu'à un état terminal. Non invocable directement par l'utilisateur.

Il ne décide pas de la stratégie, ne maintient pas le graphe/plan entre invocations, et ne passe pas à un second item.

## Entrées

**Requis :**
- Contenu complet de l'artefact graphe/plan de tranches courant
- La feuille/tranche spécifique à implémenter, verbatim
- Critères d'acceptation (de `mikado-method` ou `strangler-fig-method`), verbatim

## Sortie

Signal terminal structuré retourné à l'orchestrateur — pas de commit sur `EXPAND`/`BLOCKED` :

```json
{
  "signal": "ADVANCE | EXPAND | DONE | BLOCKED",
  "item": "<leaf id or slice id>",
  "committed": true,
  "new_items": [],
  "notes": "<one line>"
}
```

## Workflow

**Feuille Mikado :** worktree isolé si phase encore expérimentale → tenter la feuille → lancer le filet (caractérisation + contrat) + régression complète (S7) → nouvelles casses hors scope = `EXPAND` (enregistrer les prérequis, jeter la tentative) → vert = commit sur la vraie branche + `ADVANCE` (ou `DONE` si dernière feuille).

**Tranche Strangler :** implémenter la version NEW → rejouer les tests de caractérisation NEW vs OLD (équivalence de contrat) → harness complet vert → équivalent = cutover de la façade + commit + `ADVANCE` (ou `DONE` si OLD devient injoignable) ; différence non validée / tranche trop large = `EXPAND` ou `BLOCKED`.

## Invariants

- **Scope strict à l'item assigné** — rien d'autre ne change, même une amélioration repérée
- **Prérequis non découverts → STOP** — reporter `EXPAND` avec les sous-items, ne jamais forcer
- **Jamais fabriquer un pass** — « le filet passe » vient d'un run outil réel (S7), jamais du recall
- **Jamais sauter le revert (Mikado) ni le cutover gate (Strangler)** — discipline du skill chargé, verbatim
- **Exactement un signal terminal par invocation**

## Pourquoi cette forme

Un spawn frais par item est la discipline d'isolation de contexte dont dépend la boucle de réconciliation : pas de dérive entre items, et le revert d'une expérience échouée est gratuit.

> « Refactoring changes the program in small steps, so if you make a mistake, it is easy to find where the bug is. »
> — Fowler, M., *Refactoring, 2nd ed.*, 2018.

## Voir aussi

- [brownfield-refactorer]({{ "/fr/reference/agents/brownfield-refactorer" | relative_url }}) — Agent qui dispatche ce worker et maintient l'artefact
- [mikado-method]({{ "/fr/reference/skills/mikado-method" | relative_url }}) — Contrat de la feuille (expérience naïve, revert)
- [strangler-fig-method]({{ "/fr/reference/skills/strangler-fig-method" | relative_url }}) — Contrat de la tranche (équivalence, cutover)
- [Brownfield]({{ "/fr/explanation/brownfield" | relative_url }}) — Vue d'ensemble de la famille
