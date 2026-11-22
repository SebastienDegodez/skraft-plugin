---
title: "DISTILL"
description: "Pourquoi DISTILL écrit le contrat avant le code : scénarios métier, et le test d'acceptation de chacun qui échoue pour la bonne raison, lus par un humain."
persona: software-engineer
phase: distill
---

# DISTILL

Écrire le contrat avant le code : DISTILL transforme les décisions de DESIGN en scénarios que
le métier peut lire et, pour chacun d'eux, en un test d'acceptation qui échoue.

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
où DELIVER les construira. S1, celui que parcourt le walking skeleton : « Étant donné un panier
avec un latte / Quand le paiement est validé / Alors un reçu est émis et des points fidélité sont
crédités ». S2 : « une boisson indisponible ne peut pas être ajoutée au panier ». En un seul
commit, il écrit le walking skeleton en échec, du point d'entrée de commande jusqu'à la vraie
base, et les tests d'acceptation en échec de S1 et de S2 par le cas d'usage ; son plan
d'implémentation les range en deux groupes, un par règle.
:::

## Un rouge qui prouve quelque chose

En un seul passage, DISTILL écrit les scénarios, le plan de test, le plan d'implémentation, le
[walking skeleton](../deep-dive/walking-skeleton.md) et le test d'acceptation de chaque scénario,
et commite ces tests **en échec**, en un seul commit `test` dont le brief donne le message
(`test(<story>): acceptance tests S1–S<n>`). Le nom de chaque test d'acceptation commence par le
numéro de son scénario (`S2_…`, `test_s2_…`). Le designer lance les tests une fois avec la commande de test
du composant, lit que chacun échoue sur une **assertion**, et envoie la sortie de ce lancement dans
le log que nomme le brief. Le moteur ne lance aucun test : il vérifie la place et le contenu du
commit dans l'historique, et la revue DISTILL lit les tests, le squelette et ce log. C'est la boucle
externe du TDD outside-in : commencer par un test qui décrit ce que le système doit faire, vu
de l'extérieur ([Freeman & Pryce, 2009](../../reference/citations.mdx#cite-freeman-goos-2009)).

Encore faut-il que l'échec ait du sens. Un test qui échoue parce qu'un module n'existe pas ne
prouve rien : il échouerait aussi pour une story fausse, avant qu'aucune assertion ne tourne,
donc la revue le renvoie. DISTILL écrit donc aussi le **squelette** que le test appelle — les cas
d'usage que nomme le modèle d'événements, chacun rendant la valeur vide de son type, sans
comportement ; pour le walking skeleton, chaque classe de la chaîne qu'il traverse (point
d'entrée, cas d'usage, ports, adaptateurs, câblage), en réutilisant l'existant — pour que le test
échoue sur une **assertion**. Remplacer le module manquant
par une doublure dans les tests est refusé : le squelette est le vrai module, que DELIVER
remplira. Un test qui finit en erreur, est sauté, passe ou ne finit jamais est refusé de même.

La machine peut aussi être en cause. Quand aucun runtime de conteneurs ne répond, les tests qui
ont besoin de Docker ou de Podman ne peuvent pas tourner : le designer s'arrête, bloqué, et demande
qu'on en démarre un. L'étape n'est ni sautée ni jouée contre une doublure à la place.

## Tous les scénarios d'un coup, travaillés par groupe

Le plan de test liste les scénarios dans un tableau `## Scenarios`, de S1 à SN, dans l'ordre où
DELIVER les construit, chacun dans le seul composant où vit son test. S1, tagué
`@walking-skeleton`, est le scénario que parcourt le walking skeleton : un test simple, sans
Gherkin, qui traverse un composant back de son vrai point d'entrée jusqu'à une vraie base et
n'affirme que le câblage. S1 garde son propre test d'acceptation, le binding de son Gherkin, par
le cas d'usage comme tout scénario. Une story sans nouveau point d'entrée — une librairie, un
refactoring, des documents seulement — déclare plutôt cette exemption sous le tableau ; elle perd
le walking skeleton, jamais un test d'acceptation.

Quand les critères d'acceptation de l'histoire s'ouvrent par `## AC-<n>`, `### AC-<n>` ou `**AC-<n>:**` (le modèle d'histoire du backlog), la ligne de chaque scénario cite son
critère par le tag `@AC-<n>` de sa colonne Tags, et le moteur refuse un tableau où un critère n'a aucun
scénario ou en a deux, ou où un scénario en porte deux : un scénario par critère, un Scenario Outline
ne regroupant que les exemples d'un seul critère.

Le plan d'implémentation regroupe les scénarios par la règle qu'ils fixent, dans un tableau
`| Group | Scenarios | … |` : des scénarios consécutifs qui entrent par le même cas d'usage et
énoncent une règle ou ses cas limites forment un groupe, S1 dans le premier. Le tableau donne à DELIVER son ordre de travail : il fait passer
tous les groupes en un passage et commite un seul vert pour l'histoire. Un plan sans ce tableau travaille un scénario par groupe.

Écrire tous les tests d'abord coûte un seul lancement de la suite au lieu d'un par scénario, et la
revue comme l'humain lisent le contrat entier d'un coup. Le test d'un groupe pas encore livré
reste rouge jusqu'au vert : l'ingénieur ne commite rien avant que tous les tests d'acceptation passent. La revue de DISTILL et l'humain lisent ce rouge une
fois ; la revue de DELIVER lit les verts.

Le brief dit aussi à DISTILL sur quoi les tests de chaque composant font tourner leurs
dépendances, dans le test d'acceptation de chaque scénario (ciblé, S1 compris) et dans le walking
skeleton : le point d'entrée en process ou
réel, les gateways internes en mémoire ou dans Testcontainers, les gateways externes sur
Microcks, l'horloge simulée. Cette [politique d'infrastructure](../../reference/skraft-config.md#infrastructure)
vient des défauts du plugin par stack, qu'une équipe surcharge par composant dans
`skraft-config.json`. Pourquoi Microcks : [Mocking avec Microcks](../deep-dive/mocking-microcks.md).

## Un humain lit les scénarios

Avant que DELIVER ne construise quoi que ce soit, le run pose à un humain la question
`scenario-review` : voici les scénarios dans l'ordre, S1 marqué comme celui que parcourt le
walking skeleton, les groupes dans lesquels DELIVER les construit, l'exemption que déclare la
story s'il y en a une, et le commit des tests en échec. `APPROVED` laisse DELIVER les construire,
en travaillant les groupes dans cet ordre ; `REVISE` renvoie DISTILL
avec les corrections, que l'humain peut aussi faire d'abord dans le `.feature` ou les tests. Sous
Copilot, comme pour la ratification d'un ADR, seule la boîte de dialogue de l'hôte enregistre la
réponse.

C'est le moment le moins coûteux pour corriger le contrat : chaque test qui suit est écrit
d'après lui, et un scénario qui manque maintenant est une tranche que DELIVER ne pourra pas
construire plus tard.

## Des scénarios gardés dans le dépôt

DISTILL écrit ses scénarios là où le dit le `bdd` du composant, sous la forme
`<dossier features>/<bounded-context>/<feature>.feature`, sur la branche de la story : la pull request les montre, et les runs suivants les relisent. Quand
le composant déclare un lanceur Gherkin, le test d'acceptation de chaque scénario est le binding
de ces fichiers ; dans tous les cas il en reprend les valeurs mot pour mot, et la lentille
`testability` le vérifie (T2).

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

Quatre lentilles relisent le passage, une fois : la **couverture** (chaque critère a son
scénario, avec ses cas limites), l'**alignement métier** (aucun détail d'implémentation dans une
étape), la **testabilité** (chaque étape est implémentable, les rouges sont les bons, les tests
portent le walking skeleton et le test d'acceptation de chaque scénario), et les **frontières**
(le walking skeleton parcourt S1 depuis le vrai point d'entrée, chaque test d'acceptation ne
pilote que le cas d'usage).
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
