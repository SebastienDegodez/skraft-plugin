# Agent `backlog-planner`

**Statut :** ✅ Implémenté
**Source :** [`plugins/agents/backlog-planner.agent.md`](../../plugins/agents/backlog-planner.agent.md)
**Phase SDLC :** DISCUSS

## Mission

Transformer les issues triées en user stories exploitables (INVEST, DoR, AC, planning sprint).

## Quand l'utiliser

- Après DISCOVER validé.
- Pour préparer les stories prêtes pour DESIGN.

## Schéma de déclenchement

```mermaid
flowchart LR
  O[skraft-orchestrator] -->|phase DISCUSS| A[backlog-planner]
  A -->|stories-{milestone}.md + ac-draft-{story}.md| R[backlog-planner-reviewer]
  R -->|verdict| O
```

## Skills chargés

- [`issue-refinement`](../../plugins/skills/issue-refinement/SKILL.md)
- [`sprint-planning`](../../plugins/skills/sprint-planning/SKILL.md)

## Entrées / sorties

- Entrées principales :
  - `.skraft/sdlc/discover/triage-{date}.md`
  - issues GitHub triées
- Sorties :
  - `.skraft/sdlc/discuss/stories-{milestone}.md`
  - `.skraft/sdlc/discuss/ac-draft-{story}.md`

## Invariants

1. Ne jamais créer de nouvelles issues.
2. Ne jamais faire de design architecture.
3. Ne jamais modifier du code.
4. Ne jamais marquer ready-for-design sans DoR complet.
