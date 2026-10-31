---
title: "DISTILL"
description: "Pourquoi DISTILL écrit le contrat avant le code : scénarios métier, test d'acceptation qui échoue pour la bonne raison, squelette sans comportement."
persona: software-engineer
phase: distill
---

# DISTILL

Écrire le contrat avant le code : DISTILL transforme les décisions de DESIGN en scénarios que
le métier peut lire et en un test d'acceptation qui échoue.

## Pourquoi cette phase existe

Un critère d'acceptation en prose s'interprète ; un scénario exécutable, non. DISTILL fait du
comportement attendu un **contrat** entre le métier et le code : des scénarios
*Given / When / Then* écrits avec le vocabulaire de la story, et un plan de test qui place
chaque comportement au bon niveau de l'architecture. C'est la spécification par l'exemple
([Adzic, 2011](../../reference/citations.mdx#cite-adzic-specification-2011)) portée jusqu'au test.

L'`acceptance-designer` qui écrit ce contrat n'écrit pas l'implémentation. En séparant les deux,
SKRAFT évite qu'un même agent ajuste le test à son code.

:::info[☕ Fil rouge — Starbucks *(exemple illustratif)*]

L'ADR et le modèle d'événements entrent. DISTILL écrit le **scénario Gherkin** : « Étant donné
un panier avec un latte / Quand le paiement est validé / Alors un reçu est émis et des points
fidélité sont crédités. » Ce scénario devient le contrat que DELIVER doit rendre vert.
:::

## Un rouge qui prouve quelque chose

DISTILL ne s'arrête pas aux scénarios : il écrit le premier test d'acceptation et le commite
**en échec**. Le moteur rejoue ce commit et vérifie que le test échoue vraiment. C'est la boucle
externe du TDD outside-in : commencer par un test qui décrit ce que le système doit faire, vu
de l'extérieur ([Freeman & Pryce, 2009](../../reference/citations.mdx#cite-freeman-goos-2009)).

Encore faut-il que l'échec ait du sens. Un test qui échoue parce qu'un module n'existe pas ne
prouve rien : il échouerait aussi pour une story fausse. DISTILL écrit donc aussi le
**squelette** que le test appelle — les signatures que nomment les contrats, chacune rendant la
valeur vide de son type, sans comportement — pour que le test échoue sur une **assertion
métier**. Remplacer le module manquant par une doublure dans les tests est refusé : le squelette
est le vrai module, que DELIVER remplira.

## Des scénarios gardés dans le dépôt

DISTILL écrit ses scénarios dans `docs/features/<bounded-context>/<feature>.feature`, sur la
branche de la story : la pull request les montre, et les runs suivants les relisent. Aucun
lanceur de tests ne lit ces fichiers ; le test d'acceptation en reprend les valeurs mot pour mot,
et la lentille `testability` le vérifie (T2).

## Ce qui n'est pas un scénario

Un cas d'entrée purement technique — une valeur du mauvais type, `NaN`, `null`, un nombre écrit
en texte — n'a pas de formulation métier sans ambiguïté. Il ne devient jamais un scénario : le
plan de test le range comme test unitaire de la boucle interne, en citant la décision de DESIGN
qui le refuse. Les scénarios restent ainsi lisibles par le métier, et les cas techniques
restent testés.

## Quatre regards sur le contrat

Quatre lentilles relisent le travail : la **couverture** (chaque critère a son scénario, avec
ses cas limites), l'**alignement métier** (aucun détail d'implémentation dans une étape), la
**testabilité** (chaque étape est implémentable, le rouge est le bon), et les **frontières**
(le test d'acceptation ne pilote que le cas d'usage, au moins un walking skeleton par flux).
Le moteur calcule le verdict ; un `NEEDS_REWORK` renvoie l'acceptance-designer avec les findings
retenus.

## Sources

- [Adzic, G. *Specification by Example*, 2011.](../../reference/citations.mdx#cite-adzic-specification-2011)
- [Freeman, S. & Pryce, N. *Growing Object-Oriented Software, Guided by Tests*, 2009.](../../reference/citations.mdx#cite-freeman-goos-2009)

## Voir aussi <!-- #see-also -->

- [Référence : DISTILL](../../reference/phases.md#distill) — sorties, écriture permise, commits.
- [Référence : critères de revue de DISTILL](../../reference/gates.md#distill).
- [Référence : documentation durable](../../reference/run-journal.md#durable-docs).
- [Walking Skeleton](../deep-dive/walking-skeleton.md) et
  [Outside-In TDD](../deep-dive/outside-in-tdd.md).
- [DELIVER](./deliver.md) — la phase suivante.
