# Mastermind

Le jeu du Mastermind dans le navigateur : une API (`api/`) qui mène la partie et un front React
(`web/`) qui la montre. Les règles sont dans [docs/regles.md](docs/regles.md).

## Installer

Node 22.12 ou plus récent.

```bash
npm ci --prefix api
npm ci --prefix web
npx --prefix web playwright install chromium
```

## Lancer

Dans deux terminaux :

```bash
npm start --prefix api    # http://127.0.0.1:3917
npm start --prefix web    # http://127.0.0.1:5917, qui relaie /api vers l'API
```

## Développer

Chaque composant a ses commandes `build`, `lint` et `test` (`npm test --prefix api`). Les tests
de bout en bout démarrent l'API et le front eux-mêmes : `npm run e2e --prefix web`.

Le code suit la Clean Architecture et ESLint en fait respecter les dépendances :

- `api/src/domain` ne dépend que de lui-même, `api/src/application` du domaine,
  `api/src/infrastructure` et `api/src/api` (HTTP) des deux ; `api/src/main.ts` assemble le tout.
- `web/src/<fonctionnalité>/` se découpe en `application/` (cas d'usage, interfaces des
  gateways), `infrastructure/` (appels à l'API) et `ui/` (composants, hooks) ; `web/src/app/`
  assemble les fonctionnalités. Le front n'a pas de domaine : les règles du jeu sont dans l'API.
