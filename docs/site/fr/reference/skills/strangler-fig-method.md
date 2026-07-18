---
layout: doc
lang: fr
title: "strangler-fig-method"
description: "Remplacer une partie d'un système brownfield incrémentalement — derrière une façade de routage, tranche par tranche, vérifié par équivalence de contrat contre un filet vert."
persona: tech-lead
---

# strangler-fig-method

> Remplace un composant en faisant grandir une nouvelle implémentation à côté de l'ancienne, derrière une façade qui route le trafic, tranche par tranche, jusqu'à ce que l'ancienne n'ait plus d'appelant et puisse être supprimée.

## Quand l'utiliser

- Remplacer un composant trop couplé pour être restructuré sur place, ou cible d'un stack/design différent
- Chargé en interne par [brownfield-refactorer]({{ "/fr/reference/agents/brownfield-refactorer" | relative_url }}) quand l'humain choisit le remplacement plutôt que Mikado

## Précondition

Même filet de sécurité vert que Mikado ([characterize-with-contracts]({{ "/fr/reference/skills/characterize-with-contracts" | relative_url }})) — ici rejoué contre l'ANCIENNE et la NOUVELLE implémentation ; une tranche ne cutover que si NEW est équivalente au contrat de OLD sur chaque test du harness.

## Procédure (résumé)

1. **Façade** — introduire (ou confirmer) un seam de routage ; sinon la façade est la tranche zéro (transparente, vérifiée contre OLD seul)
2. **Slice** — partitionner le contrat en tranches indépendamment cutover-ables (défaut : une par endpoint)
3. **Build NEW** — implémenter une tranche, rejouer les mêmes tests de caractérisation contre NEW (équivalence de contrat)
4. **Cutover gate (S4)** — cutover seulement si tests NEW passent (mêmes assertions que OLD) ET harness complet vert
5. **Strangle** — répéter ; quand OLD est injoignable, supprimer OLD + branche OLD de la façade (tranche finale)

## Contrat de sortie

- Plan de tranches persistant (table) : `strangler-<slug>.md` — une ligne par tranche (surface de contrat, statut, verdict de cutover)
- Chaque tranche routée vers NEW après cutover vert ; OLD supprimée en tranche finale

## Invariants

- **Jamais absorber silencieusement une différence de comportement** — toute différence NEW-vs-OLD est une décision humaine
- **Jamais cutover sans rejouer le harness COMPLET** — une tranche peut sembler correcte isolément et casser une interaction cross-slice
- **Jamais sauter la transparence de la façade (tranche zéro)**
- **Jamais supprimer OLD avant de confirmer zéro trafic** — vérifier l'injoignabilité
- Signaux worker : `ADVANCE` / `EXPAND` / `DONE` / `BLOCKED`

## Pourquoi cette forme

La façade contient le rayon d'explosion : chaque tranche cutover indépendamment, avec un rollback fin, et l'équivalence de contrat est vérifiée par les mêmes tests contre les deux implémentations.

> « Gradually create a new system around the edges of the old, letting it grow slowly over several years until the old system is strangled. »
> — Fowler, M., *Bliki: StranglerFigApplication*, 2004.

## Customisation autorisée

- Granularité des tranches (défaut : une par endpoint/route)
- Type de seam de façade (route gateway, feature-flag, proxy)

## Voir aussi

- [brownfield-refactorer]({{ "/fr/reference/agents/brownfield-refactorer" | relative_url }}) — Agent qui charge ce skill et pilote la boucle
- [refactoring-worker]({{ "/fr/reference/workers/refactoring-worker" | relative_url }}) — Implémente/cutover chaque tranche dans un contexte frais
- [mikado-method]({{ "/fr/reference/skills/mikado-method" | relative_url }}) — Stratégie alternative (restructuration sur place)
- [characterize-with-contracts]({{ "/fr/reference/skills/characterize-with-contracts" | relative_url }}) — Précondition : le filet de sécurité vert
- [Brownfield]({{ "/fr/explanation/brownfield" | relative_url }}) — Vue d'ensemble de la famille
