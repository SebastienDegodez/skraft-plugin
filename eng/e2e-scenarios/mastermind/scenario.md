# Scénario : Mastermind — jouer une partie

Une story qui traverse deux composants d'un dépôt TypeScript : une API Fastify (`api/`, stack
`typescript`) et un front React (`web/`, stack `react`). La graine est un squelette qui tourne
déjà : l'API sert les couleurs du jeu, le front les affiche, chaque composant a ses couches et
ses gates, et le e2e Playwright prend une capture claire et une sombre. La story ajoute une
partie jouable dans chaque couche des deux composants, et l'étape `visuals` publie ses captures.

- Bac à sable : `SebastienDegodez/skraft-sandbox` (privé).
- Slug `jouer-une-partie` ; branche `feat/<issue>-jouer-une-partie`.
- Les règles et des exemples sont dans `docs/regles.md` du dépôt ; les critères d'acceptation
  sont dans l'issue.

## Points de contrôle

Chaque case se vérifie dans le clone (`.copilot-tracking/skraft-plans/jouer-une-partie/` :
`events.jsonl`, les documents de phase, les journaux de gates), les commits de la branche ou
GitHub.

### Avant le run

- [ ] Les deux questions de consentement (PR, captures) sont posées une fois chacune ; les
      réponses sont écrites dans `skraft-config.json` (`publish.pullRequest`, `publish.visuals`).

### RESEARCH

- [ ] Le document de recherche cite `docs/regles.md`, `api/src/domain/couleur.ts`,
      `api/src/api/serveur.ts` et la fonctionnalité `web/src/palette/` comme modèle à suivre.
- [ ] Il relève la règle des doublons (un pion du code ne compte qu'une fois).

### DESIGN

- [ ] L'évaluation est dans `api/src/domain` ; les cas d'usage (commencer une partie, proposer)
      dans `api/src/application`, qui ne connaît la conservation des parties et le tirage du
      code que par des interfaces.
- [ ] Ce qui conserve les parties et tire le code est dans `api/src/infrastructure`, les routes
      dans `api/src/api` ; `api/src/main.ts` assemble le tout et lit le code imposé.
- [ ] Le contrat HTTP (routes, corps, codes de refus) est écrit avant DISTILL.
- [ ] Le front a une nouvelle fonctionnalité (par exemple `partie`) découpée en `application/`,
      `infrastructure/`, `ui/`, sans règle du jeu recalculée dans le navigateur.
- [ ] Une ADR au statut Proposed déclenche la question de ratification ; sans ADR, aucune
      question.

### DISTILL

- [ ] Les scénarios couvrent chaque critère de l'issue, dont les doublons, la victoire et les
      quatre refus (nombre de pions, couleur hors du jeu, partie inconnue, partie gagnée).
- [ ] Les tests d'acceptation entrent par les cas d'usage de l'API et par les cas d'usage du
      front ; un commit `test(jouer-une-partie): …` rouge sur une assertion métier.

### DELIVER

- [ ] Des cycles TDD rouge puis vert, chacun committé, dans les deux composants.
- [ ] `api` et `web` passent `build`, `lint`, `test`, `architecture`, `coverage` et
      `mutation` ; chaque journal de mutation annonce 100 % sur le cœur.
- [ ] Les tests de la gateway HTTP du front doublent l'API avec MSW dans `tests/integration` ;
      `tests/unit` n'a que des doubles écrits à la main (aucun `vi.fn`, `vi.mock`, `vi.spyOn`
      ni MSW).
- [ ] Le e2e de la partie est committé avec du code qui le fait passer : un commit `test(…)`
      qui ne touche que `web/e2e/` ne peut pas être rouge, car le gate `test` ne lance pas
      Playwright.
- [ ] La revue DELIVER passe par `review.skraft.dot` et rend un verdict.

### Visuals

- [ ] L'étape `visuals` lance `npx playwright test` dans `web/` : le e2e de la palette passe
      toujours, et celui de la partie joue avec le code imposé jusqu'à la victoire.
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

- [ ] Sur la branche du run, `npm start --prefix api` et `npm start --prefix web` donnent une
      partie jouable dans le navigateur jusqu'à la victoire.

## Journal des passes

| Date | Hôte (version) | Commit du plugin | Phase atteinte | Résultat | Écarts |
| --- | --- | --- | --- | --- | --- |
