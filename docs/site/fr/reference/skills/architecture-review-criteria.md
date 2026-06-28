---
layout: doc
lang: fr
title: "architecture-review-criteria"
description: "Use when reviewing DESIGN artefacts (event models, ADRs, component diagrams, context maps, interface contracts) for q..."
persona: tech-lead
---

# architecture-review-criteria

> 15 gates réparties sur 3 lenses et 1 gate transversale d'escalade, appliquées par le `solution-architect-reviewer` sur les artefacts DESIGN.

## Quand l'utiliser

- Quand le `solution-architect-reviewer` effectue une passe de revue sur des artefacts DESIGN
- Pour vérifier la conformité DDD, le respect de Clean Architecture et l'adéquation aux stories en scope
- Pour dériver un verdict formel sur des ADRs, modèles d'événements, diagrammes de composants, context maps et contrats d'interface

## Contrat d'entrée

- ADRs (`adr-{NNN}-{slug}.md`), registre de supersession (`docs/adr/supersessions.md`)
- Modèles d'événements, diagrammes de composants, context maps
- Contrats d'interface (`contracts-{story}.md`), matrices de cohérence (`consistency-matrix-{story}.md`)
- Fichiers bloquants (`decision-drift-{story}-{NNN}.md`) sous `blockers/{date}/`

## Contrat de sortie

- Verdict formel : `approved`, `changes_requested`, ou `rejected`
- Findings par lens et par gate avec sévérité (`BLOCKER`, `HIGH`, `MEDIUM`, `LOW`)
- En cas de G13 ouvert : `REJECTED` immédiat sans évaluation des autres gates

## Invariants

- **G13 est une gate de court-circuit** — un fichier bloquant sans résolution suspend toute la revue
- **G1 back-fill obligatoire** — les patterns détectés dans le code existant sans ADR correspondant doivent être couverts
- **G14 : jamais de verdict dans le nom de fichier ADR**
- **G15 : pas d'ADR qui restate la baseline du projet** (CQS au niveau méthode, frontières de couche, enregistrement DI par convention)

| Gate | Lens | Sévérité | Sujet |
|------|------|----------|-------|
| G1 | Cohérence | BLOCKER | Tout engagement structurel a un ADR `Accepted` traçable |
| G2 | Cohérence | BLOCKER | Aucun ADR ne contredit un autre ; les supersessions sont enregistrées |
| G3 | Conformité-arch | BLOCKER | Règle de dépendance : Domain et Application n'importent pas Infrastructure ni API |
| G4 | Conformité-arch | BLOCKER | Toutes les interfaces application sont définies dans la couche Application |
| G5 | Conformité-arch | HIGH | Chaque agrégat fait respecter ses propres invariants uniquement |
| G6 | Conformité-arch | HIGH | Toutes les relations de context map sont étiquetées et admissibles |
| G7 | Fitness | HIGH | Toute story DISCUSS a au moins un Command ou Query dans le modèle d'événements |
| G8 | Fitness | HIGH | Tout Command a au moins un domain event correspondant |
| G9 | Fitness | MEDIUM | Aucun élément architectural sans traçabilité story |
| G10 | Cohérence | BLOCKER | `consistency-matrix-{story}.md` existe pour chaque story, gate PASS |
| G11 | Fitness | HIGH | Tout ADR adoptant un pattern complexe cite au moins une force admissible |
| G12 | Cohérence | BLOCKER | Chaque ligne de `supersession-plan-{story}.md` est réalisée (ADR + registre + artefacts) |
| G13 | Escalade | BLOCKER | Tout fichier bloquant a un sibling `-resolution.md` |
| G14 | Cohérence | BLOCKER | Aucun nom de fichier ADR ne porte un verdict |
| G15 | Fitness | HIGH | Aucun ADR ne restate une contrainte de la baseline du projet |

## Pourquoi cette forme

La revue adversariale par lenses indépendantes garantit que la conformité DDD (lens 2), la fitness aux stories (lens 3) et la cohérence inter-artefacts (lens 1) sont évaluées séparément. L'escalade humaine (G13) est une gate de court-circuit pour éviter que la revue ne progresse sur une base ambiguë.

> « The goal of software architecture is to minimize the human resources required to build and maintain the required system. »
> — Martin, R. C., *Clean Architecture*, 2017.

## Customisation autorisée

- Sévérité des gates G5, G6, G7, G8, G9, G11, G15 (L2 — ne pas descendre sous HIGH pour G5–G8, G11)
- Patterns supplémentaires déclenchant G11 (L2)

## Voir aussi

- [adversarial-review-lenses]({{ "/fr/reference/skills/adversarial-review-lenses" | relative_url }}) — Procédure de verdict par lenses indépendantes
- [architecture-patterns]({{ "/fr/reference/skills/architecture-patterns" | relative_url }}) — Catalogue des patterns vérifiés par ces gates
- [architecture-decisions]({{ "/fr/reference/skills/architecture-decisions" | relative_url }}) — Template et cycle de vie des ADRs
- [solution-architect-reviewer]({{ "/fr/reference/agents/solution-architect-reviewer" | relative_url }}) — Agent qui applique ce skill
