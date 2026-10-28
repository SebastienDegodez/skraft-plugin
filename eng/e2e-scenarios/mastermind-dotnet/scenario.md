# Scénario : Mastermind .NET — jouer une partie

La story du scénario `mastermind`, sur un dépôt .NET + React : une API ASP.NET Core (`api/`,
stack `dotnet`, .NET 10) et le même front React (`web/`, stack `react`). Le dépôt est la graine
de `mastermind` sans son `api/` Fastify (`"without": ["api"]`), plus `files/` : l'API .NET, sa
configuration skraft, son README et la configuration Playwright qui démarre l'API par
`dotnet run`. La graine est un squelette qui tourne déjà : l'API sert les couleurs du jeu, le
front les affiche, chaque composant a ses couches et ses gates, et le e2e Playwright prend une
capture claire et une sombre. La story ajoute une partie jouable dans chaque couche des deux
composants, et l'étape `visuals` publie ses captures.

- Bac à sable : `SebastienDegodez/skraft-sandbox` (privé), le même que `mastermind` : chaque
  remise à zéro réécrit `main` avec la graine du scénario joué.
- Slug `jouer-une-partie` ; branche `feat/<issue>-jouer-une-partie`.
- Les règles et des exemples sont dans `docs/regles.md` du dépôt ; les critères d'acceptation
  sont dans l'issue.
- L'API suit `clean-architecture-dotnet` : `Mastermind.Domain`, `Mastermind.Application`,
  `Mastermind.Infrastructure` et `Mastermind.Api` sous `api/src/`, un dossier par
  fonctionnalité dans chaque projet ; ses tests suivent `clean-architecture-testing` :
  `Mastermind.UnitTest` et `Mastermind.IntegrationTest` sous `api/tests/`.
- `api` déclare `"mocking": { "strategy": "inprocess" }` : l'API n'appelle aucun service, et la
  stratégie Microcks par défaut exigerait Docker à chaque gate qui lance les tests.
- Installer le clone demande aussi le SDK .NET 10 et `dotnet tool restore` (Stryker.NET), voir
  son `README.md`.

## Points de contrôle

Chaque case se vérifie dans le clone (`.copilot-tracking/skraft-plans/jouer-une-partie/` :
`events.jsonl`, les documents de phase, les journaux de gates), les commits de la branche ou
GitHub.

### Avant le run

- [ ] Les deux questions de consentement (PR, captures) sont posées une fois chacune ; les
      réponses sont écrites dans `skraft-config.json` (`publish.pullRequest`, `publish.visuals`).

### RESEARCH

- [ ] Le document de recherche cite `docs/regles.md`,
      `api/src/Mastermind.Domain/Couleurs/Couleur.cs`,
      `api/src/Mastermind.Api/Couleurs/CouleursEndpoints.cs` et la fonctionnalité
      `web/src/palette/` comme modèle à suivre.
- [ ] Il relève la règle des doublons (un pion du code ne compte qu'une fois).

### DESIGN

- [ ] L'évaluation est dans `Mastermind.Domain` ; les cas d'usage (commencer une partie,
      proposer) sont des classes `*UseCase` de `Mastermind.Application`, qui ne connaît la
      conservation des parties et le tirage du code que par des interfaces.
- [ ] Ce qui conserve les parties et tire le code est dans `Mastermind.Infrastructure`, enregistré
      par `AddInfrastructure()` ; les routes dans `Mastermind.Api` ; `Program.cs` lit le code
      imposé. Aucun projet ne gagne de référence hors de son voisin intérieur.
- [ ] Le contrat HTTP (routes, corps, codes de refus) est écrit avant DISTILL.
- [ ] Le front a une nouvelle fonctionnalité (par exemple `partie`) découpée en `application/`,
      `infrastructure/`, `ui/`, sans règle du jeu recalculée dans le navigateur.
- [ ] Une ADR au statut Proposed déclenche la question de ratification ; sans ADR, aucune
      question.

### DISTILL

- [ ] Les scénarios couvrent chaque critère de l'issue, dont les doublons, la victoire et les
      quatre refus (nombre de pions, couleur hors du jeu, partie inconnue, partie gagnée).
- [ ] Les tests d'acceptation entrent par les cas d'usage de l'API (`Mastermind.UnitTest`) et par
      les cas d'usage du front ; un commit `test(jouer-une-partie): …` rouge sur une assertion
      métier.

### DELIVER

- [ ] Des cycles TDD rouge puis vert, chacun committé, dans les deux composants.
- [ ] `api` passe `build`, `format`, `test`, `architecture`, `coverage` et `mutation` ; `web`
      passe `build`, `lint`, `test`, `architecture`, `coverage` et `mutation` ; chaque journal
      de mutation annonce 100 % sur le cœur.
      Écart connu (#314) : avec `--since`, le gate de mutation .NET peut passer sans tester un
      fichier du Domain modifié ; un 100 % d'`api` ne vaut que si son journal liste les mutants
      des fichiers que la story a changés.
- [ ] Les routes se testent par `WebApplicationFactory` dans `Mastermind.IntegrationTest`, et
      `ArchitectureTests` y passe toujours.
- Observation, sans case : relever les doubles de `Mastermind.UnitTest`. `clean-architecture-testing`
  y permet des mocks sur les sorties du cas d'usage, et aucun gate ne les contrôle : le scan
  sans mocks de `quality-gates-dotnet` ne lit que les projets `*.UnitTests` (#307).
- [ ] Les tests de la gateway HTTP du front doublent l'API avec MSW dans `tests/integration` ;
      `tests/unit` n'a que des doubles écrits à la main (aucun `vi.fn`, `vi.mock`, `vi.spyOn`
      ni MSW).
- [ ] Le e2e de la partie est committé avec du code qui le fait passer : un commit `test(…)`
      qui ne touche que `web/e2e/` ne peut pas être rouge, car le gate `test` ne lance pas
      Playwright.
- [ ] La revue DELIVER passe par `review.skraft.dot` et rend un verdict.

### Visuals

- [ ] L'étape `visuals` lance `npx playwright test` dans `web/`, qui démarre l'API par
      `dotnet run` : le e2e de la palette passe toujours, et celui de la partie joue avec le
      code imposé jusqu'à la victoire.
- [ ] Le manifeste liste au moins une capture de la partie en cours et une de la victoire, en
      clair et en sombre ; un commit `docs(evidence): screenshots of web` les garde.

### Pull request

- [ ] Une PR en brouillon `feat/<issue>-jouer-une-partie` → `main` est ouverte sur le bac à
      sable ; sa description vient du journal et montre les captures claires, les sombres
      repliées.
- [ ] L'issue reçoit un seul commentaire, réécrit à chaque phase et terminé par le récapitulatif ;
      aucun chemin local dedans.
- [ ] La description de la PR ne contient aucun chemin local hors des commandes de gates (le
      chemin du plugin y est attendu, voir le README).

### Après le run

- [ ] Sur la branche du run, `dotnet run --project api/src/Mastermind.Api` et
      `npm start --prefix web` donnent une partie jouable dans le navigateur jusqu'à la victoire.

## Journal des passes

| Date | Hôte (version) | Commit du plugin | Phase atteinte | Résultat | Écarts |
| --- | --- | --- | --- | --- | --- |
