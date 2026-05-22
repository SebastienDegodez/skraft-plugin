# Documentation skraft-plugin

Bienvenue dans la documentation du plugin **skraft**.

> **Conventions** : voir [`conventions.md`](./conventions.md) pour la
> signification des badges (✅ / 🚧 / 📝) et les gabarits de fiches.
>
> **Roadmap** : tout ce qui est marqué `🚧 À venir` est centralisé dans
> [`roadmap.md`](./roadmap.md).

---

## Sommaire

- [Conventions de documentation](./conventions.md)
- [Architecture du plugin](./architecture.md)
- [Roadmap (éléments à venir)](./roadmap.md)
- **Vue transverse** :
  [Le trio `skraft-orchestrator` / `software-engineer` / `software-engineer-reviewer`](./agents/software-engineer-and-reviewer.md)
- **Index global agents** : [`docs/agents/README.md`](./agents/README.md)
- **Agents** :
  - [`backlog-discoverer`](./agents/backlog-discoverer.md)
  - [`backlog-discoverer-reviewer`](./agents/backlog-discoverer-reviewer.md)
  - [`backlog-planner`](./agents/backlog-planner.md)
  - [`backlog-planner-reviewer`](./agents/backlog-planner-reviewer.md)
  - [`solution-architect`](./agents/solution-architect.md)
  - [`solution-architect-reviewer`](./agents/solution-architect-reviewer.md)
  - [`acceptance-designer`](./agents/acceptance-designer.md)
  - [`acceptance-designer-reviewer`](./agents/acceptance-designer-reviewer.md)
  - [`skraft-orchestrator`](./agents/skraft-orchestrator.md)
  - [`software-engineer`](./agents/software-engineer.md)
  - [`software-engineer-reviewer`](./agents/software-engineer-reviewer.md)
- **Reviewer lenses** :
  - [`quality-gates-lens`](./agents/reviewer-lenses/quality-gates-lens.md)
  - [`architecture-boundaries-lens`](./agents/reviewer-lenses/architecture-boundaries-lens.md)
  - [`test-integrity-lens`](./agents/reviewer-lenses/test-integrity-lens.md)
  - [`cold-reader-lens`](./agents/reviewer-lenses/cold-reader-lens.md)
- **Slides meetup (HTML)** : [`presentation-skraft-agents.html`](../presentation-skraft-agents.html)
- **Skills** :
  - [`outside-in-tdd`](./skills/outside-in-tdd.md)
  - [`red-synthesize-green`](./skills/red-synthesize-green.md)
  - [`clean-architecture-testing`](./skills/clean-architecture-testing.md)
  - [`craft-discipline`](./skills/craft-discipline.md)
  - [`create-custom-agent`](./skills/create-custom-agent.md)

---

## État global du plugin

### Agents distribués (`plugins/agents/`)

| Élément | Rôle | Statut |
|---|---|---|
| [`skraft-orchestrator`](./agents/skraft-orchestrator.md) | Orchestrateur SDLC global | ✅ Implémenté |
| [`backlog-discoverer`](./agents/backlog-discoverer.md) | Spécialiste phase DISCOVER | ✅ Implémenté |
| [`backlog-discoverer-reviewer`](./agents/backlog-discoverer-reviewer.md) | Reviewer phase DISCOVER | ✅ Implémenté |
| [`backlog-planner`](./agents/backlog-planner.md) | Spécialiste phase DISCUSS | ✅ Implémenté |
| [`backlog-planner-reviewer`](./agents/backlog-planner-reviewer.md) | Reviewer phase DISCUSS | ✅ Implémenté |
| [`solution-architect`](./agents/solution-architect.md) | Spécialiste phase DESIGN | ✅ Implémenté |
| [`solution-architect-reviewer`](./agents/solution-architect-reviewer.md) | Reviewer phase DESIGN | ✅ Implémenté |
| [`acceptance-designer`](./agents/acceptance-designer.md) | Spécialiste phase DISTILL | ✅ Implémenté |
| [`acceptance-designer-reviewer`](./agents/acceptance-designer-reviewer.md) | Reviewer phase DISTILL | ✅ Implémenté |
| [`software-engineer`](./agents/software-engineer.md) | Spécialiste phase DELIVER | ✅ Implémenté |
| [`software-engineer-reviewer`](./agents/software-engineer-reviewer.md) | Reviewer phase DELIVER | ✅ Implémenté |

### Reviewer lenses (`plugins/agents/reviewer-lenses/`)

| Élément | Statut |
|---|---|
| [`quality-gates-lens`](./agents/reviewer-lenses/quality-gates-lens.md) | ✅ Implémenté |
| [`architecture-boundaries-lens`](./agents/reviewer-lenses/architecture-boundaries-lens.md) | ✅ Implémenté |
| [`test-integrity-lens`](./agents/reviewer-lenses/test-integrity-lens.md) | ✅ Implémenté |
| [`cold-reader-lens`](./agents/reviewer-lenses/cold-reader-lens.md) | ✅ Implémenté |

### Skills distribués (`plugins/skills/`)

| Élément | Statut |
|---|---|
| `acceptance-review-criteria` | ✅ Implémenté |
| `architecture-decisions` | ✅ Implémenté |
| `architecture-patterns` | ✅ Implémenté |
| `architecture-review-criteria` | ✅ Implémenté |
| `bdd-methodology` | ✅ Implémenté |
| `clean-architecture-testing` | ✅ Implémenté |
| `contract-testing` | ✅ Implémenté |
| `craft-discipline` | ✅ Implémenté |
| `discovery-review-criteria` | ✅ Implémenté |
| `github-search-protocol` | ✅ Implémenté |
| `issue-refinement` | ✅ Implémenté |
| `issue-triage` | ✅ Implémenté |
| `mutation-testing` | ✅ Implémenté |
| `outside-in-tdd` | ✅ Implémenté |
| `planning-review-criteria` | ✅ Implémenté |
| `playwright-evidence` | ✅ Implémenté |
| `red-synthesize-green` | ✅ Implémenté |
| `sprint-planning` | ✅ Implémenté |
| `test-design-mandates` | ✅ Implémenté |
| `test-refactoring-catalog` | ✅ Implémenté |

### Skills méta

| Élément | Source | Statut |
|---|---|---|
| `create-custom-agent` | [`.agents/skills/create-custom-agent/`](../.agents/skills/create-custom-agent/) | ✅ Implémenté |

### Backlog restant

| Élément | Type | Statut |
|---|---|---|
| Hooks de gardiennage | infra | 🚧 [À venir](./roadmap.md#hooks) |

---

## Par où commencer ?

1. Lire [`architecture.md`](./architecture.md) pour comprendre la structure du repo et la séparation `plugins/` / `.agents/`.
2. Lire [`agents/skraft-orchestrator.md`](./agents/skraft-orchestrator.md) pour le flux SDLC complet.
3. Lire [`agents/software-engineer.md`](./agents/software-engineer.md) et [`agents/software-engineer-reviewer.md`](./agents/software-engineer-reviewer.md) pour la phase DELIVER.
4. Consulter [`roadmap.md`](./roadmap.md) pour le backlog restant (hooks).
