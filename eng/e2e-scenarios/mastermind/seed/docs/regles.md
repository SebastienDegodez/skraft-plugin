# Règles du Mastermind

## Le code secret

- Le meneur choisit un code secret de **4 pions**.
- Chaque pion prend l'une des **6 couleurs** du jeu : rouge, jaune, vert, bleu, orange, violet.
- Une même couleur peut apparaître plusieurs fois dans le code.

## Une proposition

- Le joueur propose 4 couleurs, dans un ordre.
- Une proposition qui ne compte pas exactement 4 pions, ou qui contient une couleur hors du jeu,
  n'est pas évaluée : elle est refusée, et le joueur sait pourquoi.

## L'évaluation

Le meneur répond par deux nombres :

- **bien placés** : les pions de la bonne couleur à la bonne position ;
- **mal placés** : les pions d'une couleur présente dans le code, mais à une autre position.

Un pion du code ne compte qu'une fois. On retire d'abord les bien placés ; parmi les pions
restants, une couleur compte comme mal placée au plus autant de fois qu'elle reste dans le code.

Exemples, le code secret étant écrit en premier :

| Code secret | Proposition | Bien placés | Mal placés |
| --- | --- | --- | --- |
| rouge jaune vert bleu | rouge jaune vert bleu | 4 | 0 |
| rouge jaune vert bleu | bleu vert jaune rouge | 0 | 4 |
| rouge jaune vert bleu | orange orange orange orange | 0 | 0 |
| rouge rouge vert bleu | rouge orange rouge rouge | 1 | 1 |
| rouge jaune jaune bleu | jaune rouge orange orange | 0 | 2 |

Une proposition avec 4 bien placés trouve le code : la partie est gagnée.
