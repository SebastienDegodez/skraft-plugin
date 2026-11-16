---
title: "Walking Skeleton — pourquoi et comment"
description: "Le deep-dive Walking Skeleton : la plus fine tranche end-to-end qui fonctionne, et comment SKRAFT la livre en premier."
---

# Walking Skeleton — pourquoi et comment

Un *squelette ambulant* est la plus petite implémentation qui traverse tout le
système de bout en bout — et qui marche réellement. On câble d'abord le chemin
complet, on l'étoffe ensuite.

## Le problème (contexte concret)

Construire couche par couche (toute la base de données, puis toute la logique, puis
toute l'API) repousse l'intégration à la fin — au moment le plus risqué. On découvre
tard que deux couches ne s'emboîtent pas, que le déploiement casse, que la frontière
réseau n'avait pas été pensée. Chaque morceau « marche en isolation » mais l'ensemble
ne marche jamais avant la toute fin.

Le walking skeleton retourne le problème : la **première** chose livrée est une
tranche minuscule qui touche chaque couche et s'exécute de bout en bout.

## Ce que disent les sources

Le terme vient d'Alistair Cockburn ([Cockburn, 2004](../../reference/citations.mdx#cite-cockburn-crystal-2004)).
Freeman & Pryce le reprennent en le créditant, et en font le point de départ d'un projet testé de
l'extérieur : la tranche de fonctionnalité réelle la plus fine que l'on sache construire, déployer
et tester de bout en bout automatiquement
([Freeman & Pryce, 2009](../../reference/citations.mdx#cite-freeman-goos-2009)).

L'idée s'enracine dans l'architecture hexagonale : isoler le domaine derrière des
ports rend cette première traversée possible sans figer l'infrastructure.

> « Allow an application to equally be driven by users, programs, automated tests, or batch scripts. »
> — Cockburn, A., *Hexagonal Architecture*, 2005.

## Application dans SKRAFT

Chaque story commence par lui, boucle externe de son TDD en double boucle. En DISTILL, le plan de
test liste les scénarios dans l'ordre où DELIVER les construit ; S1, tagué `@walking-skeleton`, est
le scénario que parcourt le walking skeleton, dans un composant back. Le moteur refuse un plan qui
tague un autre scénario, n'en tague aucun, ou place S1 dans un front React.

Le walking skeleton est un test simple, sans Gherkin, à la place des tests d'intégration du
composant : il entre par le vrai point d'entrée (HTTP, CLI, message) câblé par la composition
root de production, et n'affirme que le câblage — le statut, la forme de la réponse et une valeur
que S1 nomme mot pour mot. S1 garde à côté son propre test d'acceptation, le binding de son
Gherkin, comme tout autre scénario : à la place des tests unitaires, par le cas d'usage, chaque
valeur du scénario mot pour mot.

| | Walking skeleton | Test d'acceptation de S1 |
| --- | --- | --- |
| Prouve | le câblage de toute la chaîne | la règle métier du scénario |
| Forme | test simple, sans Gherkin | binding du `.feature` du scénario |
| Entre par | le vrai point d'entrée | le cas d'usage |
| Affirme | statut, forme, une valeur que nomme S1 | chaque valeur du scénario |
| Écrit | au passage du plan de DISTILL, un par story | à son propre passage de DISTILL, juste après |

Le passage du plan de DISTILL commite le walking skeleton en échec, avec le squelette de chaque
classe de la chaîne qu'il traverse — point d'entrée, cas d'usage, ports, adaptateurs, câblage —
chacune rendant une valeur vide. Le passage suivant commite le test d'acceptation de S1 en échec.
Un humain lit les deux avec les scénarios, puis DELIVER fait passer S1 : son vert doit faire
passer le test d'acceptation de S1 **et** le walking skeleton, et chaque vert suivant garde le
walking skeleton au vert, sans toucher à ses fichiers. La lentille `boundary-enforcement` vérifie,
par la gate **G8**, que le walking skeleton parcourt ce vrai chemin et que S1 a en plus son propre
test d'acceptation.

```text
Walking skeleton (boucle externe de S1) — traverse TOUT, affirme le câblage :
  point d'entrée ──►  cas d'usage  ──►  ports/adaptateurs  ──►  vraie base
  (réel)             (1 handler)     (câblés)               (Testcontainers)

Test d'acceptation de S1 — entre par le cas d'usage, affirme la règle métier.
S2…SN — scénarios ciblés qui épaississent chaque couche sur ce squelette vivant.
```

Le pipeline gagne une preuve d'intégration **dès la première tranche**, au lieu de la
repousser. Tout ce qui suit s'ajoute à un système qui marche déjà.

Ce sur quoi tourne chaque sorte de dépendance distingue le walking skeleton du test
d'acceptation de chaque scénario, S1 compris :

| Dépendance | Ciblé (chaque test d'acceptation) | Walking skeleton |
| --- | --- | --- |
| Point d'entrée (contrôleur, CLI, UI, webhook reçu, topic consommé) | en process | réel |
| Gateway interne (repository, base, cache) | en mémoire | Testcontainers |
| Gateway externe (REST, SOAP, GraphQL, gRPC, Kafka, webhook émis…) | Microcks | Microcks |
| Horloge, aléa | fake | fake |

Ce sont les défauts du plugin ; une équipe les surcharge par composant dans `skraft-config.json`
([politique d'infrastructure](../../reference/skraft-config.md#infrastructure)). Un front React ne
porte pas de walking skeleton à lui : ses tests ciblés remplacent le back par MSW, ses tests
end-to-end Playwright tournent contre Microcks. Un test qui a besoin d'un conteneur ne tourne
jamais sans : quand ni Docker ni Podman ne répond, le juge du rejeu demande à un humain d'en
démarrer un et le run attend.

Toute story n'ouvre pas un nouveau chemin. Celle qui n'ajoute aucun point d'entrée déclare
pourquoi sous le tableau : `library` (une pure librairie), `refactoring` (aucune nouvelle
interface publique) ou `docs-only` (configuration ou documents seulement). Une exemption retire
le walking skeleton seul, jamais le test d'acceptation de S1. Le moteur vérifie la
dernière contre le diff : une story `docs-only` dont les commits changent la source d'un
composant est refusée.

## Pièges & anti-patterns

- **Faux skeleton** : une tranche qui saute une couche (ex. simule l'API ou la base en mémoire)
  ne prouve pas l'intégration — ce n'est pas un walking skeleton.
- **Skeleton trop gros** : vouloir tout faire « correctement » dès la slice 1 annule
  le bénéfice ; la première tranche doit être *minuscule*.
- **Le laisser mourir** : un squelette qui n'est plus exécuté en CI cesse d'être une
  preuve d'intégration.
- **Un squelette à la place de S1** : un walking skeleton qui porte les assertions métier du
  scénario double le test d'acceptation de S1 sur le chemin lent, et celui qui le remplace laisse
  le Gherkin de S1 ne tourner nulle part.
- **Une exemption de confort** : déclarer `library` ou `refactoring` pour sauter le squelette. Le
  moteur ne vérifie que `docs-only` contre le diff ; l'humain qui lit les scénarios est là pour
  les autres.

## Sources

- [Cockburn, A. *Crystal Clear: A Human-Powered Methodology for Small Teams*, 2004.](../../reference/citations.mdx#cite-cockburn-crystal-2004)
- [Freeman, S. & Pryce, N. *Growing Object-Oriented Software, Guided by Tests*, 2009.](../../reference/citations.mdx#cite-freeman-goos-2009)
- Cockburn, A. *Hexagonal Architecture*, 2005.

## Voir aussi <!-- #see-also -->

- [Outside-In TDD](outside-in-tdd.md)
- [La phase DELIVER](../pipeline/deliver.mdx)
- [Les gates DISTILL](../../reference/gates.md)
