# Jouer une partie de Mastermind

En tant que joueur, je veux proposer des combinaisons de quatre couleurs et voir, pour chacune,
combien de pions sont bien placés et combien sont mal placés, afin de trouver le code secret.

Aujourd'hui l'application montre seulement les couleurs du jeu. Cette story rend une partie
jouable de bout en bout, de l'écran React jusqu'à l'API .NET (ASP.NET Core).

## Critères d'acceptation

- Le joueur commence une nouvelle partie ; l'API tire un code secret de quatre pions parmi les
  six couleurs du jeu (une couleur peut se répéter). L'API ne renvoie le code qu'une fois la
  partie gagnée, et l'écran le montre alors.
- Le joueur compose une proposition à partir de la palette et la soumet ; l'écran envoie ce qui
  est composé, même incomplet. Chaque proposition évaluée s'ajoute à l'historique de la partie
  avec ses bien placés et ses mal placés.
- L'évaluation suit les règles de `docs/regles.md` :
  - une proposition identique au code donne 4 bien placés, 0 mal placé, et la partie est gagnée :
    l'écran l'annonce avec le nombre d'essais (les propositions évaluées ; un refus ne compte
    pas) ;
  - les bonnes couleurs dans le désordre donnent 0 bien placé et 4 mal placés ;
  - aucune couleur commune donne 0 bien placé et 0 mal placé ;
  - un pion du code ne compte qu'une fois : code `rouge rouge vert bleu`, proposition
    `rouge orange rouge rouge` donnent 1 bien placé et 1 mal placé.
- L'API refuse, avec sa raison, une proposition qui ne compte pas quatre pions, qui contient
  une couleur hors du jeu, qui vise une partie inconnue ou une partie déjà gagnée. Le front ne
  vérifie pas ces règles lui-même : il montre la raison que l'API donne, et l'historique ne
  change pas.
- L'API peut démarrer avec un code secret imposé, pour les démonstrations et les tests de bout
  en bout ; sans lui, le code est tiré au hasard.
- Un test de bout en bout joue une partie avec le code imposé jusqu'à la victoire et capture
  l'écran de la partie en cours et celui de la victoire, en clair et en sombre.

## Hors périmètre

- Le nombre maximal d'essais et la défaite.
- La conservation des parties après un redémarrage de l'API.
- Plusieurs joueurs, les comptes, le classement.
