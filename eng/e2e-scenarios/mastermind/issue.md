# Évaluer une proposition

En tant que joueur de Mastermind, je veux savoir combien de pions de ma proposition sont bien
placés et combien sont mal placés, afin de me rapprocher du code secret à chaque essai.

## Critères d'acceptation

- Une proposition identique au code secret donne 4 bien placés et 0 mal placé.
- Les bonnes couleurs dans le désordre donnent 0 bien placé et 4 mal placés.
- Aucune couleur commune donne 0 bien placé et 0 mal placé.
- Un pion du code ne compte qu'une fois : code `rouge rouge vert bleu`, proposition
  `rouge orange rouge rouge` donnent 1 bien placé et 1 mal placé.
- Une proposition qui ne compte pas 4 pions, ou qui contient une couleur hors du jeu, est
  refusée avec sa raison, sans évaluation.

Les règles complètes et d'autres exemples sont dans `docs/regles.md`.

## Hors périmètre

- Le nombre d'essais d'une partie et la défaite.
- Le tirage du code secret.
- Toute interface (ligne de commande, web).
