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
  [Le duo `software-engineer` / `software-engineer-reviewer`](./agent-software-engineer-and-reviewer.md)
- **Agents** :
  - [`software-engineer`](./agents/software-engineer.md)
- **Skills** :
  - [`outside-in-tdd`](./skills/outside-in-tdd.md)
  - [`red-synthesize-green`](./skills/red-synthesize-green.md)
  - [`clean-architecture-testing`](./skills/clean-architecture-testing.md)
  - [`create-custom-agent`](./skills/create-custom-agent.md)

---

## État global du plugin

| Élément | Type | Source | Statut |
|---|---|---|---|
| `software-engineer` | agent | [`plugins/agents/software-engineer.agent.md`](../plugins/agents/software-engineer.agent.md) | ✅ Implémenté |
| `outside-in-tdd` | skill | [`plugins/skills/outside-in-tdd/`](../plugins/skills/outside-in-tdd/) | ✅ Implémenté |
| `red-synthesize-green` | skill | [`plugins/skills/red-synthesize-green/`](../plugins/skills/red-synthesize-green/) | ✅ Implémenté |
| `clean-architecture-testing` | skill | [`plugins/skills/clean-architecture-testing/`](../plugins/skills/clean-architecture-testing/) | ✅ Implémenté |
| `create-custom-agent` | skill (méta) | [`.agents/skills/create-custom-agent/`](../.agents/skills/create-custom-agent/) | ✅ Implémenté |
| `software-engineer-reviewer` | agent | — | 🚧 [À venir](./roadmap.md#reviewer) |
| `quality-framework` | skill | — | 🚧 [À venir](./roadmap.md#quality-framework) |
| `test-refactoring-catalog` | skill | — | 🚧 [À venir](./roadmap.md#test-refactoring-catalog) |
| `mutation-testing` | skill | — | 🚧 [À venir](./roadmap.md#mutation-testing) |
| Hooks de gardiennage | infra | — | 🚧 [À venir](./roadmap.md#hooks) |

---

## Par où commencer ?

1. Lire [`architecture.md`](./architecture.md) pour comprendre la
   structure du repo.
2. Lire la fiche
   [`agents/software-engineer.md`](./agents/software-engineer.md) — c'est
   le seul agent implémenté à ce jour.
3. Pour la vision complète du workflow (Engineer + Reviewer + hooks),
   lire la page transverse
   [`agent-software-engineer-and-reviewer.md`](./agent-software-engineer-and-reviewer.md).
4. Consulter [`roadmap.md`](./roadmap.md) pour savoir ce qui reste à
   construire.
