# skraft-plugin

Plugin **skraft** : pipeline SDLC agentique (DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER) avec agents spécialisés, reviewers dédiés et skills de discipline d'implémentation.

## Documentation

Toute la documentation vit dans [`docs/`](./docs/).

- 📑 [Index de documentation](./docs/README.md) — sommaire + état global agents/skills
- 🏗️ [Architecture du plugin](./docs/architecture.md)
- 🛣️ [Roadmap (reste à implémenter)](./docs/roadmap.md)
- 🤝 [Vue transverse Engineer/Reviewer](./docs/agents/software-engineer-and-reviewer.md)
- 🎨 [Conventions de documentation](./docs/conventions.md)

## État actuel — synthèse

| Composant | Statut |
|---|---|
| Pipeline SDLC orchestrée par `skraft-orchestrator` | ✅ Implémentée |
| Agents spécialisés de phase (`backlog-*`, `solution-architect*`, `acceptance-designer*`, `software-engineer*`) | ✅ Implémentés |
| Reviewer lenses (`quality-gates`, `architecture-boundaries`, `test-integrity`, `cold-reader`) | ✅ Implémentés |
| Skills opérationnels (`plugins/skills/*`) | ✅ Implémentés |
| Skill méta `create-custom-agent` (`.agents/skills/`) | ✅ Implémenté |
| Hooks de gardiennage | 🚧 [À venir](./docs/roadmap.md#hooks) |
