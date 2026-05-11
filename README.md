# skraft-plugin

Plugin **skraft** : agents et skills pour piloter du développement
discipliné (Outside-In TDD, Clean Architecture, Object Calisthenics,
mutation testing).

## Documentation

Toute la documentation vit dans [`docs/`](./docs/).

- 📑 [Index de documentation](./docs/README.md) — sommaire + tableau d'état global
- 🏗️ [Architecture du plugin](./docs/architecture.md)
- 🛣️ [Roadmap (éléments à venir)](./docs/roadmap.md)
- 🤝 [Vue transverse : trio `skraft-orchestrator` / `software-engineer` / `software-engineer-reviewer`](./docs/agent-software-engineer-and-reviewer.md)
- 🎨 [Conventions de documentation](./docs/conventions.md)

## État actuel — synthèse

| Composant | Statut |
|---|---|
| Agent `skraft-orchestrator` | ✅ Implémenté |
| Agent `software-engineer` | ✅ Implémenté |
| Agent `software-engineer-reviewer` | ✅ Implémenté |
| Skills `outside-in-tdd`, `red-synthesize-green` | ✅ Implémentés |
| Skill `craft-discipline` | ✅ Implémenté |
| Skill `mutation-testing` | ✅ Implémenté |
| Skill `test-refactoring-catalog` | ✅ Implémenté |
| Skill méta `create-custom-agent` | ✅ Implémenté |
| Hooks de gardiennage | 🚧 [À venir](./docs/roadmap.md#hooks) |
