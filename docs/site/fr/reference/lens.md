---
layout: doc
lang: fr
title: "Lentilles de revue"
description: "Les 4 lentilles de revue adverse : leur angle d'attaque et ce qu'elles opposent au travail produit."
---

# Lentilles de revue

> Une *lentille* est un angle d'attaque adverse. Le reviewer DELIVER ne lit pas le
> code « en général » : il l'examine 4 fois, sous 4 angles indépendants, puis
> synthétise un verdict pondéré.

## Pourquoi — le problème que ça résout

Un relecteur unique a des angles morts : il valide ce qu'il sait déjà chercher.
En décomposant la revue en lentilles indépendantes, chaque faiblesse est cherchée
*pour elle-même* — par une lentille dont c'est l'unique mission. Aucune n'a le droit
de « laisser passer » au nom des autres.

## Concepts clés — comment ça marche

| Lentille | Angle d'attaque | Ce qu'elle oppose |
| --- | --- | --- |
| **cold-reader** | Lit code et tests **sans aucun contexte préalable**. | Vérifie le langage métier, la clarté du nommage, la visibilité de l'intention. |
| **architecture-boundaries** | Vérifie la **direction des dépendances** Clean Architecture. | Pas de mock dans Domain/Application, Object Calisthenics sur le Domain. |
| **test-integrity** | Traque le **théâtre de test** et les violations de la règle d'or. | Tests qui n'assertent rien, tests couplés à l'implémentation, faux RED/GREEN. |
| **quality-gates** | Falsifie le **journal d'évidence** des quality gates contre l'arbre Git. | Lecture seule : confronte ce qui est déclaré à ce qui est réellement committé. |

Les 4 verdicts sont **pondérés** puis synthétisés (pattern Genesis A7) : un BLOCKER
sur une seule lentille suffit à rejeter.

### Lentilles de fidélité conditionnelles (DELIVER)

Aux 4 lentilles CORE s'ajoutent, **uniquement quand la capacité correspondante est
active**, deux lentilles de fidélité. Elles entrent dans le panel lorsque le
`software-engineer` a délégué du câblage de test à un worker (voir le
[fan-out DELIVER]({{ "/fr/explanation/pipeline/deliver" | relative_url }})).

| Lentille | Activée quand | Ce qu'elle oppose |
| --- | --- | --- |
| **mock-fidelity-lens** | `mock-integration-worker` a câblé un mock. | Le mock reflète-t-il fidèlement le contrat du dépendant (statuts, en-têtes, formes d'erreur) plutôt qu'un double complaisant ? |
| **contract-fidelity-lens** | `contract-testing-worker` a câblé un test de contrat. | Le test couvre-t-il réellement le contrat fournisseur (schéma, codes, ProblemDetails) sans le contourner ? |

Elles suivent la même règle de synthèse : un BLOCKER sur une lentille conditionnelle
rejette au même titre qu'une lentille CORE.

## Pourquoi cette pratique

> « The combined attention of several reviewers finds defects a single reader misses. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

Plusieurs lentilles indépendantes, c'est l'équivalent automatisé de plusieurs
relecteurs aux compétences complémentaires.

## Pièges & anti-patterns

- **Lentille redondante** : deux lentilles qui cherchent la même chose gaspillent
  l'effort sans réduire les angles morts.
- **Synthèse molle** : si la synthèse moyenne les verdicts au lieu de respecter les
  BLOCKER, une faille critique passe.

## Pour aller plus loin

- [Les gates franchies par phase](gates.html)
- [Le deep-dive review-before-review]({{ "/fr/explanation/deep-dive/review-before-review" | relative_url }})

## Sources

- Wiegers, K. *Peer Reviews in Software*, 2002.

Termes à connaître : **lentille (lens)**, **théâtre de test**, **règle d'or des
tests**, **Object Calisthenics** — voir le [glossaire]({{ "/fr/reference/glossaire" | relative_url }}).
