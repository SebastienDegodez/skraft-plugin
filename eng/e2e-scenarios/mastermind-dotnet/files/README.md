# Mastermind

Le jeu du Mastermind dans le navigateur : une API ASP.NET Core (`api/`) qui mène la partie et un
front React (`web/`) qui la montre. Les règles sont dans [docs/regles.md](docs/regles.md).

## Installer

Le SDK .NET 10 (10.0.300 ou plus récent, voir `api/global.json`) et Node 22.18 ou plus récent
(Babel 8, que StrykerJS installe, le demande).

```bash
dotnet restore api --locked-mode
dotnet tool restore --tool-manifest api/.config/dotnet-tools.json
npm ci --prefix web
npx --prefix web playwright install chromium
```

## Lancer

Dans deux terminaux :

```bash
dotnet run --project api/src/Mastermind.Api    # http://127.0.0.1:3917 (PORT le change)
npm start --prefix web                         # http://127.0.0.1:5917, qui relaie /api vers l'API
```

## Développer

L'API se construit et se teste depuis `api/` (`dotnet build`, `dotnet test`,
`dotnet format --verify-no-changes`) ; le front a ses commandes `build`, `lint` et `test`
(`npm test --prefix web`). Les tests de bout en bout démarrent l'API et le front eux-mêmes :
`npm run e2e --prefix web`.

Le code suit la Clean Architecture :

- `api/` a un projet par couche : `Mastermind.Domain` ne référence rien,
  `Mastermind.Application` le domaine, `Mastermind.Infrastructure` l'application (et enregistre
  les cas d'usage dans `AddInfrastructure()`), `Mastermind.Api` l'infrastructure (les endpoints et
  `Program.cs`). Dans chaque projet, un dossier par fonctionnalité (`Couleurs/`).
- Les tests de l'API sont dans `api/tests/` : `Mastermind.UnitTest` entre par les cas d'usage,
  `Mastermind.IntegrationTest` par HTTP (`WebApplicationFactory`) et garde les dépendances entre
  couches (`ArchitectureTests`, NetArchTest).
- `web/src/<fonctionnalité>/` se découpe en `application/` (cas d'usage, interfaces des
  gateways), `infrastructure/` (appels à l'API) et `ui/` (composants, hooks) ; `web/src/app/`
  assemble les fonctionnalités, et ESLint en fait respecter les dépendances. Le front n'a pas de
  domaine : les règles du jeu sont dans l'API.
