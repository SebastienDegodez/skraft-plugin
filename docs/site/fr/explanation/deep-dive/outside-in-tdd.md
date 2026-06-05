---
layout: doc
lang: fr
title: "Outside-In TDD — pourquoi et comment"
description: "Le deep-dive Outside-In TDD : double boucle, boundary-to-boundary, exemple concret du cycle RED/GREEN dans SKRAFT."
---

# Outside-In TDD — pourquoi et comment

> On fait pousser le logiciel depuis l'extérieur : un test d'acceptation guide les
> tests unitaires, qui guident l'implémentation. Le design *émerge*, il n'est pas
> deviné à l'avance.

## Le problème (contexte concret)

L'approche « du dedans vers le dehors » (écrire d'abord les entités, puis les
brancher) produit souvent du code dont personne n'avait besoin : des classes trop
générales, des méthodes spéculatives, une couche d'infrastructure conçue avant de
savoir ce que le métier attend. Résultat : du code mort, des tests fragiles couplés à
l'implémentation, et un design figé trop tôt.

Outside-In inverse la direction : on part du **comportement observable** (ce que
l'utilisateur ou le système appelant attend) et on ne crée une collaboration interne
que lorsqu'un test l'exige.

## Ce que disent les sources

La discipline du test d'abord vient de Beck : écrire un test qui échoue *avant* la
moindre ligne d'implémentation.

> « Never write a line of functional code without a broken test case. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

Freeman & Pryce formalisent la version « outside-in » avec sa double boucle : une
boucle externe (acceptation) qui encadre une boucle interne (unitaire).

> « We grow working software, guided by tests, from the outside in. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

## Application dans SKRAFT

La phase DELIVER applique la **double boucle**. La boucle externe est le scénario
d'acceptation issu de DISTILL ; la boucle interne est le cycle RED → GREEN → REFACTOR
unitaire.

```text
┌─ Boucle externe (acceptation, depuis DISTILL) ───────────────┐
│  RED  : le scénario .feature échoue (rien n'est câblé)        │
│   ┌─ Boucle interne (unitaire) ──────────────────────────┐   │
│   │  RED → un test unitaire échoue                         │   │
│   │  GREEN → implémentation minimale qui le fait passer    │   │
│   │  REFACTOR → on nettoie sans changer le comportement    │   │
│   └────────────────────────────────────────────────────────┘  │
│  GREEN : le scénario d'acceptation passe à son tour          │
└──────────────────────────────────────────────────────────────┘
```

Concrètement, le `software-engineer` ne crée une interface (port) que lorsqu'un test
unitaire en a besoin pour isoler une frontière — jamais « au cas où ». Le test
d'acceptation reste rouge tant que la tranche n'est pas complète, ce qui garde le cap
sur le comportement métier.

## Pièges & anti-patterns

- **Tester l'implémentation** : asserter sur des appels internes plutôt que sur le
  comportement observable rend le test fragile au refactoring.
- **Sauter le RED** : écrire le test après le code prive le test de son pouvoir de
  falsification — on ne sait plus s'il échouerait vraiment.
- **Sur-mocker** : un mock à chaque frontière interne transforme le test en miroir du
  code (voir la lentille *test-integrity*).

## Sources

- Beck, K. *Test-Driven Development by Example*, 2003.
- Freeman, S. & Pryce, N. *Growing Object-Oriented Software, Guided by Tests*, 2009.

Pour aller plus loin : [Walking Skeleton](walking-skeleton.html),
[la phase DELIVER]({{ "/fr/explanation/pipeline/deliver" | relative_url }}), [le glossaire]({{ "/fr/reference/glossaire" | relative_url }}).
