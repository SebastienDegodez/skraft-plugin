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

Chaque story commence par lui. En DISTILL, le plan de test liste les scénarios dans l'ordre où
DELIVER les construit ; S1, tagué `@walking-skeleton`, est le walking skeleton, dans un composant
back : point d'entrée → cas d'usage → vraie base. Le moteur refuse un plan qui tague un autre
scénario, n'en tague aucun, ou place S1 dans un front React. DISTILL commite d'abord le test
d'acceptation en échec de S1, un humain le lit avec les autres scénarios, et DELIVER le fait
passer avant qu'aucun autre scénario n'ait son test. La lentille `boundary-enforcement` vérifie
toujours, par la gate **G8**, que chaque flux a son scénario walking skeleton.

```text
S1 (walking skeleton) — traverse TOUT, fait le minimum :
  point d'entrée ──►  cas d'usage  ──►  Domain  ──►  vraie base
  (réel)             (1 handler)     (1 invariant)  (Testcontainers)

  ✔ le scénario d'acceptation end-to-end passe
  ✔ chaque frontière est câblée

S2…SN — scénarios ciblés qui épaississent chaque couche sur ce squelette vivant.
```

Le pipeline gagne une preuve d'intégration **dès la première tranche**, au lieu de la
repousser. Tout ce qui suit s'ajoute à un système qui marche déjà.

Ce sur quoi tourne chaque sorte de dépendance distingue S1 des scénarios ciblés qui suivent :

| Dépendance | Scénarios ciblés | Walking skeleton |
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
interface publique) ou `docs-only` (configuration ou documents seulement). Le moteur vérifie la
dernière contre le diff : une story `docs-only` dont les commits changent la source d'un
composant est refusée.

## Pièges & anti-patterns

- **Faux skeleton** : une tranche qui saute une couche (ex. simule l'API ou la base en mémoire)
  ne prouve pas l'intégration — ce n'est pas un walking skeleton.
- **Skeleton trop gros** : vouloir tout faire « correctement » dès la slice 1 annule
  le bénéfice ; la première tranche doit être *minuscule*.
- **Le laisser mourir** : un squelette qui n'est plus exécuté en CI cesse d'être une
  preuve d'intégration.
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
