# Mastermind

Le jeu du Mastermind, côté meneur : le code secret, les couleurs et l'évaluation des
propositions. Les règles sont dans [docs/regles.md](docs/regles.md).

## Développer

```bash
npm ci
npm run build
npm run lint
npm test
```

Le code suit la Clean Architecture : `src/domain` ne dépend que de lui-même, `src/application`
dépend du domaine. ESLint fait respecter ces dépendances.
