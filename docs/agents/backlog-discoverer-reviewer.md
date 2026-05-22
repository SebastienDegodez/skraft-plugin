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

## Entrées / sorties

- Entrées principales :
  - `.skraft/sdlc/discover/triage-{date}.md`
  - `.skraft/sdlc/discover/sprint-proposal.md`
- Sortie : verdict YAML/JSON (`approved`, `changes_requested`, `rejected`) avec findings par gate.

## Invariants

1. Lecture seule.
2. Application explicite de toutes les gates de revue.
3. P0 manquant = rejet.
