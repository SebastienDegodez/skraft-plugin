---
layout: doc
lang: fr
title: "discovery-review-criteria"
description: "Use when reviewing DISCOVER artefacts (triage reports, sprint proposals) for completeness, prioritization quality, an..."
persona: tech-lead
---

# discovery-review-criteria

> Définitions de gates et rubrique de verdict pour le reviewer DISCOVER — appliquées sur 3 lenses (complétude, priorisation, détection de doublons) avec 6 gates (G1–G6).

## Quand l'utiliser

- Quand le `backlog-discoverer-reviewer` effectue une passe de revue sur des artefacts DISCOVER
- Pour évaluer la qualité des rapports de triage et des propositions de sprint
- Pour dériver un verdict formel sur la couverture des issues, la cohérence de priorisation et la gestion des doublons

## Contrat d'entrée

- `triage-report-{date}.md` — rapport de triage avec issues classées et propositions de sprint
- Accès en lecture au dépôt GitHub pour le sample-check G2 (P0/P1 ouverts)
- Capacité déclarée de l'équipe (team-days)

## Contrat de sortie

- Verdict formel : `approved`, `changes_requested`, ou `rejected`
- Findings par lens avec sévérité (`BLOCKER`, `HIGH`, `MEDIUM`)
- Pour G2 (BLOCKER) : liste des issues P0/P1 absentes du rapport

## Invariants

- **G2 est la seule gate BLOCKER** — une issue P0/P1 absente du triage est une faute grave
- **Capacité effective = team-days × 0,7** pour les issues P1/P2/P3 (les P0 surchargent toujours)
- **Les issues XL n'entrent jamais dans le sprint** — G4 échoue si une issue XL est incluse
- **Pas de P3 avant P1** — un P3 dans le sprint alors qu'un P1 est exclu est une inversion de priorité

| Gate | Lens | Sévérité | Définition |
|------|------|----------|-----------|
| G1 | Complétude | HIGH | Les 3 modes de découverte ont été appliqués ou leur absence est justifiée |
| G2 | Complétude | BLOCKER | Aucune issue P0/P1 ouverte n'est absente du rapport (sample-check top 5) |
| G3 | Priorisation | HIGH | Pas d'inversion de priorité ; tout P0 a une justification écrite |
| G4 | Priorisation | HIGH | Capacité effective respectée ; aucune issue XL dans le sprint |
| G5 | Doublons | HIGH | Aucune paire de doublons non détectée (similarité normalisée > 80 %) |
| G6 | Doublons | MEDIUM | Toutes les paires 40–80 % sont signalées dans la section "Duplicates Detected" |

**Seuils de similarité :**

| Niveau | Similarité | Action requise |
|---|---|---|
| EXACT | > 95 % | Une issue labellisée `status/duplicate` liée à l'originale |
| NEAR | 80–95 % | Recommandation de fusion ; les deux issues liées, documentées |
| RELATED | 40–80 % | Signalées comme "related", recommandation documentée |
| DIFFERENT | < 40 % | Aucune action requise |

## Pourquoi cette forme

La découverte est la phase la moins visible mais la plus coûteuse en cas d'échec : une issue P0 absente du sprint devient un incident de production ou une dette critique. Les gates G2 et G4 protègent contre les deux erreurs les plus fréquentes — issues critiques invisibles et sprints sur-chargés.

> « Maximizing the amount of work not done is essential. »
> — Reinertsen, D. G., *The Principles of Product Development Flow*, 2009.

## Customisation autorisée

- Seuil de similarité pour G5 (L2 — ne pas descendre sous 70 %)
- Nombre d'issues dans le sample-check G2 (L2 — ne pas descendre sous 3)
- Sévérité de G1 et G3 (L2)

## Voir aussi

- [adversarial-review-lenses]({{ "/fr/reference/skills/adversarial-review-lenses" | relative_url }}) — Procédure de verdict par lenses indépendantes
- [issue-triage]({{ "/fr/reference/skills/issue-triage" | relative_url }}) — Skill de triage produit les artefacts revus ici
- [backlog-discoverer]({{ "/fr/reference/agents/backlog-discoverer" | relative_url }}) — Agent producteur des artefacts DISCOVER
