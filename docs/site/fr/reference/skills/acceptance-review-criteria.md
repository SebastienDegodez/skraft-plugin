---
layout: doc
lang: fr
title: "acceptance-review-criteria"
description: "Use when reviewing DISTILL artefacts (Gherkin scenarios, test plans, implementation plans) for quality, completeness,..."
persona: tech-lead
---

# acceptance-review-criteria

> Définitions de gates et rubrique de verdict pour le reviewer DISTILL — appliquées sur 4 lenses (couverture, alignement-métier, testabilité, conformité-aux-frontières).

## Quand l'utiliser

- Quand l'`acceptance-designer-reviewer` effectue une passe de revue sur des artefacts DISTILL
- Pour évaluer la qualité des scénarios Gherkin, des plans de test et des plans d'implémentation
- Pour dériver un verdict formel (`approved`, `changes_requested`, `rejected`) à partir des résultats des lenses

## Contrat d'entrée

- `ac-draft-{story}.md` — critères d'acceptation de la story
- Fichiers `*.feature` — scénarios Gherkin
- `impl-plan-{story}.md` — plan d'implémentation avec chemins de fichiers et frontières de cas d'utilisation
- `contracts-{story}.md` — interfaces de la couche Application

## Contrat de sortie

- Verdict formel parmi `approved`, `changes_requested`, `rejected`
- Liste de findings par lens avec sévérité (`BLOCKER`, `HIGH`, `MEDIUM`, `LOW`)
- Niveau de confiance (`high`, `medium`, `low`) selon la complétude des artefacts présents

## Invariants

- **9 gates (G1–G9)** réparties sur 4 lenses — aucune gate ne peut être ignorée
- **Un seul BLOCKER suffit à déclencher `rejected`** — G1, G4, G7 sont toujours des BLOCKERs
- **Pas de correction silencieuse** — un minority finding est toujours documenté même s'il est overridé
- **La dissidence est tracée** — quand 3 lenses passent et 1 échoue, le raisonnement d'override est explicite

| Gate | Lens | Sévérité | Définition abrégée |
|------|------|----------|--------------------|
| G1 | Couverture | BLOCKER | Bijection AC → scénario : tout AC a ≥1 scénario, aucun scénario orphelin |
| G2 | Couverture | HIGH | ≥1 scénario couvre un cas limite ou une condition de frontière par règle métier |
| G3 | Alignement-métier | HIGH | Tous les termes Given/When/Then appartiennent au vocabulaire du domaine |
| G4 | Alignement-métier | BLOCKER | Zéro détail d'implémentation dans les étapes Gherkin |
| G5 | Testabilité | HIGH | Chaque étape est non ambiguë dans le vocabulaire du domaine |
| G6 | Testabilité | HIGH | Bijection scénarios feature ↔ entrées du plan d'implémentation |
| G7 | Frontières | BLOCKER | Chaque entrée de la matrice de couverture cible un cas d'utilisation Application |
| G8 | Frontières | HIGH | ≥1 scénario walking skeleton par flux fonctionnel principal |
| G9 | Frontières | HIGH | Chaque scénario tagué `@visual` a ≥1 spec E2E Playwright correspondante dans `tests/e2e/` |

## Pourquoi cette forme

Les revues adversariales par lenses indépendantes réduisent le biais de confirmation : chaque lens applique un critère unique sans être influencée par les autres. Le jury du DELIVER — ingénieurs, testeurs, architectes — consomme des artefacts DISTILL. Un scénario contaminé par du jargon technique ou un AC sans scénario correspondant se traduit directement en dette de cycle.

> « Specifications that are automatically verifiable provide concrete examples of desired system behaviour. »
> — Adzic, G., *Specification by Example*, 2011.

## Customisation autorisée

- Seuil de confiance à partir duquel une revue est considérée incomplète (L2)
- Messages de dissent (L1)
- Sévérité des gates G2, G5, G6, G8, G9 (L2 — ne pas descendre sous HIGH)

## Voir aussi

- [adversarial-review-lenses]({{ "/fr/reference/skills/adversarial-review-lenses" | relative_url }}) — Procédure de verdict par lenses indépendantes
- [bdd-methodology]({{ "/fr/reference/skills/bdd-methodology" | relative_url }}) — Authoring des scénarios Gherkin
- [acceptance-designer]({{ "/fr/reference/agents/acceptance-designer" | relative_url }}) — Agent producteur des artefacts DISTILL
