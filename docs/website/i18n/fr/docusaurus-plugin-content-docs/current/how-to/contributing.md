---
layout: doc
lang: fr
title: "Proposer un pattern ou corriger la documentation"
description: "Proposer un nouveau pattern selon genesis (problème, solution, référence publiée), ouvrir la pull request qui l'accompagne, lire le verdict d'évaluation, et corriger une page du handbook en FR et en EN."
persona: tech-lead
---

# Proposer un pattern ou corriger la documentation

**But** : faire entrer un pattern dans skraft, ou corriger une page du handbook, par une pull
request que l'équipe peut accepter.

> **Genesis.** Un pattern n'entre dans skraft qu'avec trois éléments : un problème observé, une
> solution qui a marché dans au moins un contexte réel, et une référence publiée qui défend la
> même approche. Sans eux, c'est une préférence, que chacun contourne dès que le contexte
> change. Comment skraft rend ensuite chaque pratique opposable :
> [Software craftsmanship]({{ "/fr/explanation/software-craftsmanship" | relative_url }}).

## Prérequis

- Un fork du dépôt `skraft-plugin`, une branche créée depuis `main`, Node 22 ou plus.
- `npm install` fait à la racine du clone.

## Proposer un pattern

1. **Écrivez le problème en une phrase**, du point de vue de qui en souffre. Pas « on devrait
   mieux structurer les tests », mais « les tests d'acceptation échouent pour des raisons
   d'infrastructure : la logique métier n'est pas isolée ».
2. **Décrivez la solution en comportement observable** : ce qu'elle change dans le pipeline, les
   artefacts ou le code produit, et ce qu'elle ne change pas.
3. **Trouvez la référence publiée** (livre, article, conférence) et ajoutez-la à
   `docs/site/_data/citations.yml` si elle n'y est pas.
4. **Écrivez le pattern** : le `SKILL.md` sous `plugins/<plugin>/skills/<skill>/`, ou le
   descripteur d'agent dans les deux arbres d'agents, puis `npm run plugin:sync` et
   `npm run plugin:check`.
5. **Écrivez sa spec d'évaluation** :
   [Évaluer un skill]({{ "/fr/how-to/evaluate-a-skill" | relative_url }}).
6. **Ouvrez la pull request**, avec dans sa description le problème, la solution et la
   référence.
7. **Lisez le verdict** que la CI poste en commentaire (`9V/4E/2D (p=0,065)`) : seule une
   `regression` bloque la fusion ;
   [Lire un verdict d'évaluation]({{ "/fr/explanation/deep-dive/reading-a-verdict" | relative_url }})
   dit quoi faire des autres.

Un chiffre avancé sans source se reformule qualitativement et se suffixe `(estimé)`.

## Corriger une page du handbook

1. Modifiez la page sous `docs/site/fr/` **et** sa jumelle sous `docs/site/en/` (même nom de
   fichier anglais).
2. Pour une nouvelle page, déclarez-la dans `docs/site/_data/book.yml`, en FR et en EN.
3. Vérifiez les citations :

   ```bash
   npm run lint:citations
   ```

   Résultat attendu : `All citations valid.`
4. Ouvrez la pull request avec une description du changement.

## Voir aussi

- [Patterns]({{ "/fr/reference/patterns" | relative_url }}) — chaque pattern et sa référence.
- [Citations]({{ "/fr/reference/citations" | relative_url }})
- [Évaluer un skill]({{ "/fr/how-to/evaluate-a-skill" | relative_url }})
