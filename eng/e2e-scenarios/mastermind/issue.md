# Jouer une partie de Mastermind

En tant que joueur, je veux proposer des combinaisons de quatre couleurs et voir, pour chacune,
combien de pions sont bien placés et combien sont mal placés, afin de trouver le code secret.

Aujourd'hui l'application montre seulement les couleurs du jeu. Cette story rend une partie
jouable de bout en bout, de l'écran jusqu'à l'API.

## Critères d'acceptation

- Le joueur commence une nouvelle partie ; l'API tire un code secret de quatre pions parmi les
  six couleurs du jeu (une couleur peut se répéter). Le code n'est jamais montré ni renvoyé
  tant que la partie n'est pas gagnée.
- Le joueur compose une proposition de quatre pions à partir de la palette et la soumet ; chaque
  proposition évaluée s'ajoute à l'historique de la partie avec ses bien placés et ses mal placés.
- L'évaluation suit les règles de `docs/regles.md` :
  - une proposition identique au code donne 4 bien placés, 0 mal placé, et la partie est gagnée :
    l'écran l'annonce avec le nombre d'essais, et la partie n'accepte plus de proposition ;
  - les bonnes couleurs dans le désordre donnent 0 bien placé et 4 mal placés ;
  - aucune couleur commune donne 0 bien placé et 0 mal placé ;
  - un pion du code ne compte qu'une fois : code `rouge rouge vert bleu`, proposition
    `rouge orange rouge rouge` donnent 1 bien placé et 1 mal placé.
- Une proposition qui ne compte pas quatre pions, ou qui contient une couleur hors du jeu, est
  refusée par l'API avec sa raison ; l'écran montre cette raison et l'historique ne change pas.
- Une proposition pour une partie inconnue est refusée.
- Le serveur peut démarrer avec un code secret imposé, pour les démonstrations et les tests de
  bout en bout ; sans lui, le code est tiré au hasard.

## Hors périmètre

- Le nombre maximal d'essais et la défaite.
- La conservation des parties après un redémarrage de l'API.
- Plusieurs joueurs, les comptes, le classement.
