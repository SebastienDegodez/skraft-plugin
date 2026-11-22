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

Le pipeline applique la **double boucle**, un seul passage pour toute la story. La boucle externe est le
scénario d'acceptation : DISTILL commite en un commit le test en échec de chacun, après un
lancement dont la sortie montre chacun échouant sur une assertion, que lit la revue DISTILL. La boucle interne est le cycle RED → GREEN → REFACTOR
unitaire, que le `software-engineer` tourne en DELIVER sans le commiter.

La story elle-même s'ouvre sur une boucle externe plus large, son
[walking skeleton](walking-skeleton.md) : un test simple qui entre par le vrai point d'entrée et
ne vérifie que le câblage. DISTILL le commite en échec avec les tests d'acceptation ; l'unique vert de l'histoire les fait passer tous deux. Le test
d'acceptation de chaque scénario, S1 compris, entre par le cas d'usage.

```text
┌─ Boucle externe (acceptation, chaque groupe dans l'ordre du plan) ┐
│  RED  : DISTILL commite le test de chaque scénario, une fois  │
│         → test(<story>): acceptance tests S1–Sn               │
│   ┌─ Boucle interne (unitaire, non commitée) ─────────────┐  │
│   │  RED → un test unitaire échoue                         │   │
│   │  GREEN → implémentation minimale qui le fait passer    │   │
│   │  REFACTOR → on nettoie sans changer le comportement    │   │
│   └────────────────────────────────────────────────────────┘  │
│  GREEN : les scénarios d'acceptation de chaque groupe passent │
│         → un seul feat(<story>): <règles>, après le dernier groupe │
└──────────────────────────────────────────────────────────────┘
les groupes sont travaillés dans l'ordre du plan, en un passage, un commit
```

Concrètement, le `software-engineer` ne crée une interface que lorsqu'un test unitaire en a
besoin pour isoler une frontière — jamais « au cas où ». Le test d'acceptation reste rouge tant
que le scénario n'est pas complet, ce qui garde le cap sur le comportement métier, et il ne
change jamais : écrit par un autre agent, il est l'oracle que le code doit satisfaire. L'histoire
se termine par un seul commit vert, enchaîné à la commande de test pour n'avoir lieu
qu'une fois tous les tests passés ; un deuxième vert est refusé (`green-split`).

DISTILL commite tous les tests d'acceptation rouges d'un coup, à côté du walking skeleton en échec,
dans un seul commit de test : l'historique ne porte qu'un rouge pour toute la story, et la revue lit
le run qui montre chaque test échouer sur son assertion métier. Le moteur ne voit jamais échouer les
tests unitaires de la boucle interne ; la mutation, que le développeur lance sur sa branche hors du
pipeline, montre qu'ils détecteraient une erreur.

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
