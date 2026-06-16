---
layout: doc
lang: fr
title: "Genesis — l'origine des patterns"
description: "Pourquoi chaque pattern SKRAFT existe, comment genesis garantit une conception disciplinée, et comment proposer un nouveau pattern."
---

# Genesis — l'origine des patterns

> Chaque pattern de SKRAFT a une histoire. Genesis est le processus discipliné qui garantit qu'un pattern ne naît pas d'une intuition, mais d'un problème identifié, d'une solution validée et d'une référence qui la justifie.

## Pourquoi genesis ?

Un pipeline agentique est aussi fort que ses patterns. Un pattern mal conçu introduit une contrainte arbitraire que personne ne comprend — et que tout le monde contourne dès que le contexte change.

Genesis impose une question avant toute chose : **quel problème ce pattern résout-il, et comment le savons-nous ?**

La réponse doit s'appuyer sur :
1. Une observation concrète du problème (pas une intuition),
2. Une solution qui a fonctionné dans au moins un contexte réel (estimé : plusieurs itérations de validation),
3. Une référence publiée (livre, article, conférence) qui défend la même approche.

Sans ces trois éléments, le pattern n'est pas prêt.

## Comment un pattern entre dans SKRAFT

### Étape 1 — Identifier le problème

Décrivez le problème en une phrase, depuis le point de vue de quelqu'un qui en souffre. Pas : "on devrait mieux structurer les tests". Oui : "les tests d'acceptation échouent pour des raisons d'infrastructure — la logique métier n'est pas isolée."

### Étape 2 — Formuler la solution candidate

Décrivez la solution en termes de comportement observable : ce qu'elle change dans le pipeline, dans les artefacts, dans le code produit. Soyez précis sur ce que la solution ne change pas.

### Étape 3 — Trouver la référence

Toute solution défendue dans SKRAFT doit être ancrée dans une référence publiée. La référence n'est pas là pour paraître sérieux — elle permet à quiconque de vérifier les hypothèses derrière la solution, et de comprendre ses limites.

Exemples de références valides : Evans (DDD, 2003), Freeman & Pryce (GOOS, 2009), Martin (Clean Architecture, 2017), Forsgren et al. (Accelerate, 2018).

### Étape 4 — Ouvrir une Pull Request

Votre PR doit contenir :
- Le fichier `SKILL.md` (ou `.agent.md`) décrivant le pattern,
- Une entrée dans `docs/site/_data/citations.yml` pour chaque nouvelle référence,
- Les pages FR et EN correspondantes dans `docs/site/`,
- La mise à jour de `docs/site/_data/book.yml` pour déclarer les nouvelles pages.

Incluez dans la description de PR : le problème identifié, la solution proposée, et la ou les références qui la justifient.

## Ce que genesis interdit

- **Inventer une métrique.** Si vous affirmez que le pattern réduit les bugs de 30 %, vous devez citer la source. Sans source, reformulez qualitativement : "réduit le nombre de bugs détectés tardivement (estimé)".
- **Copier sans citer.** Toute idée tirée d'une référence externe doit apparaître dans `citations.yml`.
- **Proposer un pattern sans problème.** Un pattern sans problème clairement formulé n'est pas un pattern — c'est une préférence personnelle.

## Contribuer à la documentation

Pour corriger ou améliorer une page existante :

1. Forkez le dépôt et créez une branche depuis `main`.
2. Modifiez les pages dans `docs/site/fr/` **et** `docs/site/en/` (les deux langues sont requises).
3. Vérifiez les citations :

```bash
node scripts/check-citations.mjs --citations docs/site/_data/citations.yml --pages "docs/site/**/*.md"
```

4. Ouvrez une Pull Request avec une description claire du changement.

## Sources

- Evans, E., *Domain-Driven Design*, 2003.
- Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.
- Martin, R. C., *Clean Architecture*, 2017.

## Voir aussi

- [Customisation]({{ "/fr/tutorials/customisation" | relative_url }}) — ce que vous pouvez adapter et les risques associés
- [Les patterns]({{ "/fr/reference/patterns" | relative_url }}) — tous les patterns avec leur référence

