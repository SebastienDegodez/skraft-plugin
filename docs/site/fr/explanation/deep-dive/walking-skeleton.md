---
layout: doc
lang: fr
title: "Walking Skeleton — pourquoi et comment"
description: "Le deep-dive Walking Skeleton : la plus fine tranche end-to-end qui fonctionne, et comment SKRAFT la livre en premier."
---

# Walking Skeleton — pourquoi et comment

> Un *squelette ambulant* est la plus petite implémentation qui traverse tout le
> système de bout en bout — et qui marche réellement. On câble d'abord le chemin
> complet, on l'étoffe ensuite.

## Le problème (contexte concret)

Construire couche par couche (toute la base de données, puis toute la logique, puis
toute l'API) repousse l'intégration à la fin — au moment le plus risqué. On découvre
tard que deux couches ne s'emboîtent pas, que le déploiement casse, que la frontière
réseau n'avait pas été pensée. Chaque morceau « marche en isolation » mais l'ensemble
ne marche jamais avant la toute fin.

Le walking skeleton retourne le problème : la **première** chose livrée est une
tranche minuscule qui touche chaque couche et s'exécute de bout en bout.

## Ce que disent les sources

Freeman & Pryce introduisent le terme et en font le point de départ d'un projet
testé de l'extérieur.

> « A Walking Skeleton is the thinnest possible slice of real functionality we can automatically build, deploy, and test end-to-end. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

L'idée s'enracine dans l'architecture hexagonale : isoler le domaine derrière des
ports rend cette première traversée possible sans figer l'infrastructure.

> « Allow an application to equally be driven by users, programs, automated tests, or batch scripts. »
> — Cockburn, A., *Hexagonal Architecture*, 2005.

## Application dans SKRAFT

En DELIVER, la première slice livrée pour une feature est délibérément un walking
skeleton. La gate DISTILL **G8** l'exige : « au moins un scénario walking skeleton par
flux majeur ».

```text
Slice 1 (walking skeleton) — traverse TOUT, fait le minimum :
  API  ──►  Application (use case)  ──►  Domain  ──►  Infrastructure
  (1 endpoint)   (1 handler)         (1 invariant)   (1 repo stub)

  ✔ le scénario d'acceptation end-to-end passe
  ✔ le déploiement fonctionne
  ✔ chaque frontière est câblée

Slices suivantes — on épaissit chaque couche sur ce squelette vivant.
```

Le pipeline gagne une preuve d'intégration **dès la première tranche**, au lieu de la
repousser. Tout ce qui suit s'ajoute à un système qui marche déjà.

## Pièges & anti-patterns

- **Faux skeleton** : une tranche qui saute une couche (ex. simule l'API en mémoire)
  ne prouve pas l'intégration — ce n'est pas un walking skeleton.
- **Skeleton trop gros** : vouloir tout faire « correctement » dès la slice 1 annule
  le bénéfice ; la première tranche doit être *minuscule*.
- **Le laisser mourir** : un squelette qui n'est plus exécuté en CI cesse d'être une
  preuve d'intégration.

## Sources

- Freeman, S. & Pryce, N. *Growing Object-Oriented Software, Guided by Tests*, 2009.
- Cockburn, A. *Hexagonal Architecture*, 2005.

Pour aller plus loin : [Outside-In TDD](outside-in-tdd.html),
[la phase DELIVER]({{ "/fr/explanation/pipeline/deliver" | relative_url }}), [les gates DISTILL]({{ "/fr/reference/gates" | relative_url }}).
