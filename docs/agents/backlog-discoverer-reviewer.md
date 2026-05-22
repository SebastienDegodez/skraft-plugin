# Agent `backlog-discoverer-reviewer`

**Statut :** ✅ Implémenté
**Source :** [`plugins/agents/backlog-discoverer-reviewer.agent.md`](../../plugins/agents/backlog-discoverer-reviewer.agent.md)
**Phase SDLC :** DISCOVER

## Mission

Auditer de manière adversariale les artefacts DISCOVER (`triage`, `sprint-proposal`) et rendre un verdict structuré.

## Quand l'utiliser

- Après exécution de `backlog-discoverer`.
- Pour auditer un triage existant.

## Schéma de déclenchement

```mermaid
flowchart LR
  A[backlog-discoverer] -->|triage-{date}.md + sprint-proposal.md| R[backlog-discoverer-reviewer]
  R -->|approved / changes_requested / rejected| O[skraft-orchestrator]
```

## Skill chargé

- [`discovery-review-criteria`](../../plugins/skills/discovery-review-criteria/SKILL.md)

## Lenses de revue

- Complétude (modes de découverte, couverture P0/P1)
- Cohérence de priorisation (P0/P1, capacité sprint)
- Détection de doublons

## Gates (G1-G6)

- **G1 (HIGH)** : couverture explicite des 2 modes de découverte (sélection/skip justifiés).
- **G2 (BLOCKER)** : aucun P0/P1 ouvert manquant dans le triage.
- **G3 (HIGH)** : priorisation cohérente (justification P0, pas d'inversion de priorité).
- **G4 (HIGH)** : proposition de sprint compatible capacité (hors override P0) et sans issue XL.
- **G5 (HIGH)** : aucun doublon exact/proche (>80%) non détecté.
- **G6 (MEDIUM)** : les paires liées (40-80%) sont signalées avec recommandation.

Voir les critères détaillés dans la skill : [`discovery-review-criteria`](../../plugins/skills/discovery-review-criteria/SKILL.md).

## Entrées / sorties

- Entrées principales :
  - `.skraft/sdlc/discover/triage-{date}.md`
  - `.skraft/sdlc/discover/sprint-proposal.md`
- Sortie : verdict YAML/JSON (`approved`, `changes_requested`, `rejected`) avec findings par gate.

## Invariants

1. Lecture seule.
2. Application explicite de toutes les gates de revue.
3. P0 manquant = rejet.
