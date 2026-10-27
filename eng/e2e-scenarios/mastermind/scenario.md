# Scénario : Mastermind — évaluer une proposition

Une story de domaine pur sur un dépôt TypeScript (Vitest, StrykerJS) qui n'a que les couleurs
du jeu. Elle exerce tout le pipeline sans Docker ni interface : pas d'étape `visuals`.

- Bac à sable : `SebastienDegodez/skraft-sandbox` (privé).
- Slug `evaluer-proposition` ; branche `feat/<issue>-evaluer-proposition`.
- Les règles et des exemples sont dans `docs/regles.md` du dépôt ; les critères d'acceptation
  sont dans l'issue.

## Points de contrôle

Chaque case se vérifie dans le clone (`.copilot-tracking/skraft-plans/evaluer-proposition/` :
`events.jsonl`, les documents de phase, les journaux de gates), les commits de la branche ou
GitHub.

### RESEARCH

- [ ] Le document de recherche cite `docs/regles.md` et `src/domain/couleur.ts`.
- [ ] Il relève la règle des doublons (un pion du code ne compte qu'une fois).
- [ ] La revue rend un verdict ; aucune boucle de reprise au-delà des tentatives prévues.

### DESIGN

- [ ] Le modèle place l'évaluation dans `src/domain` (et un cas d'usage dans `src/application`
      s'il en propose un), sans dépendance du domaine vers l'application.
- [ ] Une ADR au statut Proposed déclenche la question de ratification ; sans ADR, aucune
      question.

### DISTILL

- [ ] Les scénarios couvrent les cinq critères de l'issue, dont les doublons et les deux refus.
- [ ] Un commit `test(evaluer-proposition): …` rouge sur une assertion métier.

### DELIVER

- [ ] Des cycles TDD rouge puis vert, chacun committé.
- [ ] Les gates `build`, `lint`, `test`, `architecture`, `coverage` et `mutation` passent ;
      le journal du gate de mutation annonce 100 % sur le cœur.
- [ ] La revue DELIVER passe par `review.skraft.dot` et rend un verdict.

### Pull request

- [ ] La question de consentement à la PR est posée une fois ; la réponse est écrite dans
      `skraft-config.json` (`publish.pullRequest`).
- [ ] Une PR en brouillon `feat/<issue>-evaluer-proposition` → `main` est ouverte sur le bac à
      sable ; sa description vient du journal.
- [ ] L'issue reçoit un seul commentaire, réécrit à chaque phase et terminé par le récapitulatif ;
      aucun chemin local dedans.
- [ ] La description de la PR ne contient aucun chemin local hors des commandes de gates (le
      chemin du plugin y est attendu, voir le README).

## Journal des passes

| Date | Hôte (version) | Commit du plugin | Phase atteinte | Résultat | Écarts |
| --- | --- | --- | --- | --- | --- |
