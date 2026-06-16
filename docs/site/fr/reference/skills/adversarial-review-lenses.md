---
layout: doc
lang: fr
title: "adversarial-review-lenses"
description: "Use when a reviewer agent must produce an adversarial verdict via 4 independent lenses and weighted synthesis (Genesi..."
persona: tech-lead
---

# adversarial-review-lenses

> Procédure d'exécution de 4 lenses indépendantes et de synthèse pondérée pour produire un verdict adversarial défendable sur un artefact de phase.

## Quand l'utiliser

- Chaque reviewer SKRAFT invoque ce skill lors de chaque passe de revue, après avoir lu les artefacts de la phase amont
- Le nombre de lenses exécutées dépend du `depthTier` enregistré dans `state.json`

| Depth tier | Lenses requises |
|---|---|
| `basic` | 1 (Complétude uniquement) |
| `standard` | 2 (Complétude + Alignement-métier) |
| `comprehensive` (défaut) | 4 (toutes les lenses) |
| `custom` | selon `userPreferences.customDepth.reviewerLenses`, minimum 1 |

## Contrat d'entrée

- Artefact(s) de la phase à reviewer (chemin relatif)
- Skill `*-review-criteria` de la phase correspondante (lu avant d'exécuter les lenses)
- `state.json::userPreferences.depthTier` pour connaître le nombre de lenses à exécuter

## Contrat de sortie

- Fichier de revue sous `reviews/{YYYY-MM-DD}/{phase}-{slug}-review.md`
- Verdict : `APPROVED`, `NEEDS_REWORK`, ou `REJECTED`
- Score pondéré calculé à partir des 4 lenses (poids fixes)
- Liste de required actions lorsque le verdict est `NEEDS_REWORK` ou `REJECTED`

## Invariants

- **Pas de contamination entre lenses** — les findings d'une lens ne doivent pas influencer une autre
- **Un seul `INVARIANT_VIOLATION` dans Lens 4 force `REJECTED`** quelle que soit la somme pondérée
- **Le reviewer ne modifie jamais les artefacts amont** — lecture seule
- **Poids des lenses fixes :** Complétude 0,30 — Alignement-métier 0,30 — Qualité 0,15 — Risque 0,25

| Lens | Poids | Tags de findings |
|------|-------|-----------------|
| 1 — Complétude | 0,30 | `MISSING`, `THIN`, `OK` |
| 2 — Alignement-métier | 0,30 | `MISALIGNED`, `AMBIGUOUS`, `OK` |
| 3 — Qualité | 0,15 | `BROKEN`, `INCONSISTENT`, `OK` |
| 4 — Risque | 0,25 | `INVARIANT_VIOLATION`, `HIDDEN_COUPLING`, `AMBIGUOUS_ASSUMPTION`, `OK` |

**Table de verdict :**

| Somme pondérée | Verdict |
|---|---|
| ≥ 0,85 et aucune lens à 0,0 | `APPROVED` |
| ≥ 0,55 | `NEEDS_REWORK` |
| < 0,55 ou une lens à 0,0 sur invariant | `REJECTED` |

## Pourquoi cette forme

L'adversarial review s'inspire du pattern Genesis Step 7 : des panels de juges indépendants produisent des verdicts plus fiables que les revues collégiales où le biais de conformité nivelle les dissidences. La synthèse pondérée préserve la dominance des lenses métier (Complétude + Alignement-métier = 60 %) sur les lenses structurelles.

> « Peer reviews consistently find more defects per hour than any other technique. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

## Customisation autorisée

- Depth tier (via `state.json` — L1)
- Nombre minimal de lenses pour `custom` (minimum 1 — L2)
- Format du fichier de sortie (L1)

## Voir aussi

- [acceptance-review-criteria]({{ "/fr/reference/skills/acceptance-review-criteria" | relative_url }}) — Gates DISTILL
- [architecture-review-criteria]({{ "/fr/reference/skills/architecture-review-criteria" | relative_url }}) — Gates DESIGN
- [discovery-review-criteria]({{ "/fr/reference/skills/discovery-review-criteria" | relative_url }}) — Gates DISCOVER
