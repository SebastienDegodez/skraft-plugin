# Mastermind en ligne : PRD

Statut : approuvé.

Aujourd'hui l'application montre seulement les couleurs du jeu : une API Fastify (`api/`) sert la
palette, un front React (`web/`) l'affiche. Ce PRD décrit le jeu complet pour un joueur seul. Les
règles d'évaluation sont dans `docs/regles.md` ; l'épic `EP-003` étend la longueur du code, que
ces règles fixent à quatre pions.

## Objectifs (Goals)

* `GOAL-001` : Un joueur finit une partie, gagnée ou perdue, sans quitter l'écran.
* `GOAL-002` : Le joueur règle la difficulté d'une partie avant de la commencer.

## Contraintes (Constraints)

* `CON-001` : Le jeu reste une API Fastify (`api/`) et un front React (`web/`) ; les parties vivent dans la mémoire de l'API.
* `CON-002` : L'API peut démarrer avec un code secret imposé, pour les démonstrations et les tests de bout en bout.
* `CON-003` : Les règles du jeu sont calculées par l'API ; le front ne fait qu'afficher ce qu'elle renvoie.

## Exigences fonctionnelles (Functional Requirements)

### EP-001 : Jouer une partie

* `FR-001` : Lorsqu'un joueur commence une partie, l'API doit tirer un code secret de quatre pions (sauf réglage contraire) parmi les six couleurs du jeu, une couleur pouvant se répéter.
  * Critères d'acceptation : AC-001.
* `FR-002` : Lorsque le joueur soumet une proposition, l'API doit renvoyer le nombre de pions bien placés et mal placés selon les règles de `docs/regles.md`.
  * Critères d'acceptation : AC-002, AC-003.
* `FR-003` : L'écran doit afficher l'historique des propositions de la partie avec leur évaluation, dans l'ordre où elles ont été soumises.
  * Critères d'acceptation : AC-004.
* `FR-004` : Si la proposition est identique au code, alors la partie doit être gagnée et l'écran doit montrer le code et le nombre d'essais.
  * Critères d'acceptation : AC-005.
* `FR-005` : Si une proposition n'a pas le bon nombre de pions, contient une couleur hors du jeu, ou vise une partie inconnue ou terminée, alors l'API doit la refuser avec son motif et l'écran doit afficher ce motif.
  * Critères d'acceptation : AC-006.

### EP-002 : Fin de partie

* `FR-006` : Si le joueur soumet sa dixième proposition sans trouver le code, alors la partie doit être perdue et l'écran doit révéler le code.
  * Critères d'acceptation : AC-007.
* `FR-007` : Lorsque le joueur abandonne une partie en cours, l'écran doit révéler le code et proposer une nouvelle partie.
  * Critères d'acceptation : AC-008.

### EP-003 : Réglages de la partie

* `FR-008` : Lorsqu'il commence une partie, le joueur doit pouvoir choisir la longueur du code, de quatre à six pions.
  * Critères d'acceptation : AC-009.
* `FR-009` : Lorsqu'il commence une partie, le joueur doit pouvoir interdire qu'une couleur se répète dans le code.
  * Critères d'acceptation : AC-010.

## Exigences non fonctionnelles (Non-Functional Requirements)

* `NFR-001` : L'API doit évaluer une proposition en 200 ms au plus au 95e centile, sur le poste du joueur.
* `NFR-002` : Chaque écran doit garder un contraste de texte WCAG AA en thème clair et en thème sombre.

## Critères d'acceptation (Acceptance Criteria)

* `AC-001` : Étant donné l'API démarrée sans code imposé, Quand le joueur commence une partie, Alors une partie est créée et sa réponse ne contient pas le code.
* `AC-002` : Étant donné le code `rouge rouge vert bleu`, Quand le joueur propose `rouge orange rouge rouge`, Alors l'API renvoie 1 bien placé et 1 mal placé.
* `AC-003` : Étant donné le code `rouge vert bleu jaune`, Quand le joueur propose `jaune bleu vert rouge`, Alors l'API renvoie 0 bien placé et 4 mal placés.
* `AC-004` : Étant donné deux propositions évaluées, Quand le joueur regarde la partie, Alors l'écran les liste dans l'ordre avec leurs évaluations.
* `AC-005` : Étant donné le code imposé `rouge vert bleu jaune`, Quand le joueur propose ce code à son troisième essai, Alors l'écran annonce la victoire en 3 essais et montre le code.
* `AC-006` : Étant donné une partie en cours de quatre pions, Quand le joueur propose trois pions, Alors l'API refuse la proposition pour nombre de pions et l'historique ne change pas.
* `AC-007` : Étant donné neuf propositions fausses, Quand le joueur en soumet une dixième fausse, Alors la partie est perdue et l'écran révèle le code.
* `AC-008` : Étant donné une partie en cours après deux essais, Quand le joueur abandonne, Alors l'écran révèle le code et propose une nouvelle partie.
* `AC-009` : Étant donné une partie commencée avec six pions, Quand le joueur propose quatre pions, Alors l'API refuse la proposition pour nombre de pions.
* `AC-010` : Étant donné les répétitions interdites, Quand l'API tire le code, Alors ses pions sont tous de couleurs différentes.

## Hors périmètre

* Plusieurs joueurs, les comptes, le classement.
* La conservation des parties après un redémarrage de l'API.
