# Scénario : Mastermind — du PRD au backlog

Le workflow `skraft-prd-backlog` (plugin `skraft-backlog`) découpe un PRD en épics et en stories,
les rédige, les fait revoir, puis publie le backlog sur GitHub. Le dépôt de départ est la graine
du scénario `mastermind` (API Fastify et front React qui tournent déjà), plus le PRD
`docs/prd/mastermind.md` : trois épics, neuf FR, deux NFR, dix critères d'acceptation, en
français.

- Bac à sable : `SebastienDegodez/skraft-sandbox` (privé), le même que le scénario `mastermind` :
  chaque remise à zéro ferme aussi les issues que l'autre a laissées.
- Slug `mastermind` ; le run travaille sur `main` et ne pousse rien. Seule la publication
  écrit sur GitHub.
- Arguments : `{"prd":"docs/prd/mastermind.md","slug":"mastermind"}`.
- Les fichiers de travail sont dans `.copilot-tracking/skraft-plans/mastermind/backlog/` du
  clone.

## Points de contrôle

### INVENTORY et FRAME

- [ ] L'inventaire lit `EP-001` à `EP-003`, `FR-001` à `FR-009`, `NFR-001` et `NFR-002`,
      `AC-001` à `AC-010`, `CON-001` à `CON-003`, `GOAL-001` et `GOAL-002` ; la langue est le
      français.
- [ ] Les questions de cadrage sont écrites dans `framing.json`, chacune avec sa
      recommandation ; le run se met en pause (`framing-answered`) et reprend après les
      réponses.

### SLICE

- [ ] `story-map.json` couvre les neuf FR ; chaque épic a une story « tracer » ; aucune
      dépendance `after` ne forme de cycle ni ne vise un jalon plus tardif.
- [ ] Le run se met en pause sur `story-map.md` ; il reprend sans qu'on modifie la carte.

### ELABORATE

- [ ] Une fiche `stories/<id>.json` par story de la carte ; chacune a un persona, au moins
      trois exemples, de trois à sept critères Given/When/Then, des tâches et un effort de 1
      à 8.
- [ ] Les exemples reprennent les valeurs du PRD (doublons `rouge rouge vert bleu` /
      `rouge orange rouge rouge`, dix essais, quatre à six pions).

### REVIEW

- [ ] Chaque épic reçoit un verdict des quatre lentilles de planification ; une story
      refusée retient les stories qui l'attendent.
- [ ] Un constat de dépendance déjà déclarée dans la carte est écarté ; une dépendance absente
      devient une proposition dans `slice-proposals.json`, jamais une réécriture.

### Canvas (app Copilot)

- [ ] Le canvas « skraft backlog » s'ouvre et montre la progression pendant le run, puis la
      revue story par story (INVEST, Definition of Ready), en français.
- [ ] Une question ouverte reçoit une réponse dans le canvas ; un run avec
      `corrections: true` l'écrit dans la fiche et ne revoit que les stories touchées.
- [ ] « Dry run » puis « Create » publient un épic revu sans rien créer deux fois.

### HANDOFF et PUBLISH

- [ ] Le run se met en pause sur `handoff.md` ; sans la case « Human Review » cochée, rien
      n'est publié.
- [ ] Après la case cochée : les labels et les milestones, puis un issue par épic et un issue
      par story, en sous-issues de leur épic, avec les liens « blocked by » de la carte.
- [ ] Chaque issue porte le marqueur caché et le label `skraft-backlog` ; un second run ne
      crée rien de plus.

### Après le run

- [ ] La story de l'épic `EP-001` qui ouvre une partie est assez précise pour lancer le
      scénario `mastermind` dessus (critères d'acceptation complets, hors périmètre écrit).

## Journal des passes

| Date | Hôte (version) | Commit du plugin | Phase atteinte | Résultat | Écarts |
| --- | --- | --- | --- | --- | --- |
