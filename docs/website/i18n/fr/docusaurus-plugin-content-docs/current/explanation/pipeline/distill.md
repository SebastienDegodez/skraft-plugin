---
title: "DISTILL"
description: "Pourquoi DISTILL écrit le contrat avant le code : scénarios métier, un test d'acceptation à la fois qui échoue pour la bonne raison, lus par un humain."
persona: software-engineer
phase: distill
---

# DISTILL

Écrire le contrat avant le code : DISTILL transforme les décisions de DESIGN en scénarios que
le métier peut lire et, un scénario à la fois, en un test d'acceptation qui échoue.

## Pourquoi cette phase existe

Un critère d'acceptation en prose s'interprète ; un scénario exécutable, non. DISTILL fait du
comportement attendu un **contrat** entre le métier et le code : des scénarios
*Given / When / Then* écrits avec le vocabulaire de la story, et un plan de test qui place
chaque comportement au bon niveau de l'architecture. C'est la spécification par l'exemple
([Adzic, 2011](../../reference/citations.mdx#cite-adzic-specification-2011)) portée jusqu'au test.

L'`acceptance-designer` qui écrit ce contrat n'écrit pas l'implémentation. En séparant les deux,
SKRAFT évite qu'un même agent ajuste le test à son code.

:::info[☕ Fil rouge — Starbucks *(exemple illustratif)*]

L'ADR et le modèle d'événements entrent. DISTILL écrit chaque scénario de la story, dans l'ordre
où DELIVER les construira. S1, le walking skeleton : « Étant donné un panier avec un latte /
Quand le paiement est validé / Alors un reçu est émis et des points fidélité sont crédités », du
point d'entrée de commande jusqu'à la vraie base. S2 : « une boisson indisponible ne peut pas être
ajoutée au panier ». Il ne commite en échec que le test d'acceptation de S1 ; celui de S2 vient
une fois S1 au vert.
:::

## Un rouge qui prouve quelque chose

À son premier passage, DISTILL écrit les scénarios, le plan de test et le test d'acceptation du
premier scénario, et commite ce test **en échec**, en un seul commit `test` dont le brief donne
le message. Le moteur rejoue ce commit avec la commande de test du composant et garde ce qu'elle
affiche ; quand les tests échouent, il les rejoue aussi au commit parent, et le
[juge du rejeu](pathname:///dashboard/#agent-replay-judge) lit les deux logs et le commit. Le
rouge ne tient que si le test du scénario échoue sur une **assertion** ; un rouge dont tous les
tests passent est refusé sans interroger le juge. C'est la boucle
externe du TDD outside-in : commencer par un test qui décrit ce que le système doit faire, vu
de l'extérieur ([Freeman & Pryce, 2009](../../reference/citations.mdx#cite-freeman-goos-2009)).

Encore faut-il que l'échec ait du sens. Un test qui échoue parce qu'un module n'existe pas ne
prouve rien : il échouerait aussi pour une story fausse, avant qu'aucune assertion ne tourne,
donc le juge le renvoie. DISTILL écrit donc aussi le **squelette** que le test appelle — les cas
d'usage que nomme le modèle d'événements, chacun rendant la valeur vide de son type, sans
comportement — pour que le test échoue sur une **assertion métier**. Remplacer le module manquant
par une doublure dans les tests est refusé : le squelette est le vrai module, que DELIVER
remplira. Un test qui finit en erreur, est sauté, passe ou ne finit jamais est refusé de même.

La machine peut aussi être en cause. Quand aucun runtime de conteneurs ne répond, les tests qui
ont besoin de Docker ou de Podman ne peuvent pas tourner : le juge le lit dans le log et demande
à un humain d'en démarrer un. L'étape n'est ni sautée ni jouée contre une doublure à la place.

## Un scénario à la fois

Le plan de test liste les scénarios dans un tableau `## Scenarios`, de S1 à SN, dans l'ordre où
DELIVER les construit, chacun dans le seul composant où vit son test. S1 est le
[walking skeleton](../deep-dive/walking-skeleton.md) : tagué `@walking-skeleton`, il traverse un
composant back de son point d'entrée jusqu'à une vraie base. Une story sans nouveau point
d'entrée — une librairie, un refactoring, des documents seulement — déclare plutôt cette
exemption sous le tableau.

DISTILL n'écrit le test que du scénario en cours. Un test écrit pour un scénario à venir
resterait rouge pendant toute la livraison, et rien ne distinguerait son rouge d'une régression.
Alors, après la revue de DISTILL et la lecture d'un humain, le moteur alterne : DELIVER fait
passer S1 au vert, puis DISTILL écrit le test en échec de S2, DELIVER le fait passer, et ainsi de
suite. Ces passages suivants ne sont pas revus à nouveau ; le rejeu de chaque rouge, et le vert
qui doit le faire passer, les vérifient.

Le brief dit aussi à DISTILL sur quoi les tests de chaque composant font tourner leurs
dépendances, dans un scénario ciblé et dans le walking skeleton : le point d'entrée en process ou
réel, les gateways internes en mémoire ou dans Testcontainers, les gateways externes sur
Microcks, l'horloge simulée. Cette [politique d'infrastructure](../../reference/skraft-config.md#infrastructure)
vient des défauts du plugin par stack, qu'une équipe surcharge par composant dans
`skraft-config.json`. Pourquoi Microcks : [Mocking avec Microcks](../deep-dive/mocking-microcks.md).

## Un humain lit les scénarios

Avant que DELIVER ne construise quoi que ce soit, le run pose à un humain la question
`scenario-review` : voici les scénarios dans l'ordre, S1 marqué walking skeleton, et le commit du
test en échec de S1. `APPROVED` laisse DELIVER les construire un à un ; `REVISE` renvoie DISTILL
avec les corrections, que l'humain peut aussi faire d'abord dans le `.feature` ou le test. Sous
Copilot, comme pour la ratification d'un ADR, seule la boîte de dialogue de l'hôte enregistre la
réponse.

C'est le moment le moins coûteux pour corriger le contrat : chaque test qui suit est écrit
d'après lui, et un scénario qui manque maintenant est une tranche que DELIVER ne pourra pas
construire plus tard.

## Des scénarios gardés dans le dépôt

DISTILL écrit ses scénarios là où le dit le `bdd` du composant, sous la forme
`<dossier features>/<bounded-context>/<feature>.feature`, sur la branche de la story : la pull request les montre, et les runs suivants les relisent. Aucun
lanceur de tests ne lit ces fichiers ; le test d'acceptation en reprend les valeurs mot pour mot,
et la lentille `testability` le vérifie (T2).

Un composant dit s'il décrit son comportement ainsi, avec `bdd` dans `skraft-config.json`
([skraft-config.json](../../reference/skraft-config.md#component)). C'est une pratique qui se
déclare, pas une barre : un composant qui le laisse actif est tenu à ses scénarios en entier, et
celui qui refuse ne se voit demander aucun `.feature` — DISTILL prend alors ses scénarios dans la
colonne `Scenario` du plan de test, et le TDD de DELIVER tourne exactement comme toujours. Une clé
absente vaut oui.

## Ce qui n'est pas un scénario

Un cas d'entrée purement technique — une valeur du mauvais type, `NaN`, `null`, un nombre écrit
en texte — n'a pas de formulation métier sans ambiguïté. Il ne devient jamais un scénario : le
plan de test le range comme test unitaire de la boucle interne, en citant la décision de DESIGN
qui le refuse. Les scénarios restent ainsi lisibles par le métier, et les cas techniques
restent testés.

## Quatre regards sur le contrat

Quatre lentilles relisent le premier passage, une fois : la **couverture** (chaque critère a son
scénario, avec ses cas limites), l'**alignement métier** (aucun détail d'implémentation dans une
étape), la **testabilité** (chaque étape est implémentable, le rouge est le bon, le test ne porte
que le scénario en cours), et les **frontières**
(le test d'acceptation ne pilote que le cas d'usage, au moins un walking skeleton par flux).
Le moteur calcule le verdict ; un `NEEDS_REWORK` renvoie l'acceptance-designer avec les findings
retenus. Son brief donne le chemin d'`acceptance-review-criteria`, les gates selon lesquels ces
lentilles jugent : il vérifie ses sorties contre chacun avant d'écrire son résultat.

## Sources

- [Adzic, G. *Specification by Example*, 2011.](../../reference/citations.mdx#cite-adzic-specification-2011)
- [Freeman, S. & Pryce, N. *Growing Object-Oriented Software, Guided by Tests*, 2009.](../../reference/citations.mdx#cite-freeman-goos-2009)

## Voir aussi <!-- #see-also -->

- [Référence : DISTILL](../../reference/phases.md#distill) — sorties, écriture permise, commits.
- [Référence : critères de revue de DISTILL](../../reference/gates.md#distill).
- [Référence : documentation durable](../../reference/run-journal.md#durable-docs).
- [Walking Skeleton](../deep-dive/walking-skeleton.md) et
  [Outside-In TDD](../deep-dive/outside-in-tdd.md).
- [DELIVER](./deliver.mdx) — la phase suivante.
