---
title: "Outside-In TDD — pourquoi et comment"
description: "Le deep-dive Outside-In TDD : double boucle, boundary-to-boundary, exemple concret du cycle RED/GREEN dans SKRAFT."
---

# Outside-In TDD — pourquoi et comment

On fait pousser le logiciel depuis l'extérieur : un test d'acceptation guide les
tests unitaires, qui guident l'implémentation. Le design *émerge*, il n'est pas
deviné à l'avance.

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

Le pipeline applique la **double boucle**, un scénario à la fois. La boucle externe est le
scénario d'acceptation : DISTILL commite son test en échec, le moteur rejoue ce commit, et le
[juge du rejeu](pathname:///dashboard/#agent-replay-judge) lit le log du rejeu pour confirmer
qu'il échoue sur une assertion. La boucle interne est le cycle RED → GREEN → REFACTOR
unitaire, que le `software-engineer` tourne en DELIVER sans le commiter.

```text
┌─ Boucle externe (acceptation, scénario k) ───────────────────┐
│  RED  : DISTILL commite le test du scénario, en échec         │
│         → test(<story>): <scénario>   (rejoué : assertion)    │
│   ┌─ Boucle interne (unitaire, non commitée) ─────────────┐  │
│   │  RED → un test unitaire échoue                         │   │
│   │  GREEN → implémentation minimale qui le fait passer    │   │
│   │  REFACTOR → on nettoie sans changer le comportement    │   │
│   └────────────────────────────────────────────────────────┘  │
│  GREEN : le scénario d'acceptation passe à son tour           │
│         → feat(<story>): <scénario>   (rejoué : passe)        │
└──────────────────────────────────────────────────────────────┘
puis le scénario k+1
```

Concrètement, le `software-engineer` ne crée une interface que lorsqu'un test unitaire en a
besoin pour isoler une frontière — jamais « au cas où ». Le test d'acceptation reste rouge tant
que le scénario n'est pas complet, ce qui garde le cap sur le comportement métier, et il ne
change jamais : écrit par un autre agent, il est l'oracle que le code doit satisfaire. Chaque
scénario se termine par un seul commit vert, enchaîné à la commande de test pour n'avoir lieu
qu'une fois les tests passés.

Un seul test d'acceptation est rouge à la fois. DISTILL écrit le test du scénario suivant une
fois le précédent passé, si bien qu'un rouge dans l'historique nomme toujours le scénario en
cours. Le moteur ne voit jamais échouer les tests unitaires de la boucle interne ; la mutation,
lancée en dernier sur toute la story, montre qu'ils détecteraient une erreur.

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

## Voir aussi <!-- #see-also -->

- [Walking Skeleton](walking-skeleton.md)
- [La phase DELIVER](../pipeline/deliver.mdx)
- [Le glossaire](../../reference/glossary.md)
