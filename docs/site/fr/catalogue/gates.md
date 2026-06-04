---
layout: doc
lang: fr
title: "Gates de revue"
description: "Les gates (Gxx) franchies par phase : ce que chaque gate vérifie et pourquoi."
---

# Gates de revue

> Une *gate* est un critère explicite et binaire : le reviewer la déclare PASS ou
> FAIL avant que le pipeline passe à la phase suivante. Rien d'implicite, rien de
> « à l'œil ».

## Pourquoi — le problème que ça résout

Sans critères écrits, une revue dépend de l'humeur et de la mémoire du relecteur.
Les gates rendent la revue **reproductible** : chaque verdict s'appuie sur une liste
de contrôles connue d'avance, partagée par le producteur et le reviewer. Une gate qui
échoue bloque la transition (BLOCKER) ou signale un risque (HIGH/MEDIUM) — jamais un
ressenti vague.

## Concepts clés — comment ça marche

Chaque phase possède sa propre grille de gates, vérifiée par un reviewer indépendant.

| Phase | Gates | Ce qu'elles défendent |
| --- | --- | --- |
| DISCOVER | G1–G6 | Les 3 modes de découverte couverts, aucun P0/P1 oublié, priorités justifiées, capacité du sprint respectée, doublons détectés. |
| DISCUSS | G1–G8 | INVEST par story, pas de dépendance circulaire, ≥3 critères d'acceptation non ambigus, périmètre de milestone cohérent, DAG topologique. |
| DESIGN | G1–G15 | Chaque choix structurel tracé par un ADR, règle de dépendance Clean Architecture, invariants par agrégat, context map étiqueté, pas d'ADR « baseline ». |
| DISTILL | G1–G8 | Bijection critère↔scénario, cas limites représentés, vocabulaire métier, zéro jargon technique, étapes non ambiguës, couverture walking skeleton. |
| DELIVER | tests + mutation | RED/GREEN intègre, build vert, score de mutation au-dessus du seuil, commits propres (voir le contrat d'évidence des quality gates). |

Une gate **BLOCKER** non franchie arrête la phase. Une gate **HIGH** ou **MEDIUM**
documente un risque que le reviewer consigne dans son verdict.

## Pourquoi cette pratique

> « A software inspection is a rigorous review with explicit entry and exit criteria. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

Des critères d'entrée/sortie explicites, c'est exactement ce qu'une gate matérialise :
la phase n'est « finie » que lorsque ses gates sont franchies.

## Pièges & anti-patterns

- **Gate cosmétique** : un critère trop vague (« le code est propre ») n'est pas une
  gate — il faut un test binaire vérifiable.
- **Reviewer complaisant** : si le producteur et le reviewer sont la même personne,
  la gate perd son pouvoir. SKRAFT impose un reviewer *indépendant*.
- **Court-circuit** : certaines gates (ex. DESIGN G13) court-circuitent toute la revue
  si un blocker humain reste non résolu — ne pas les contourner.

## Pour aller plus loin

- [Les lentilles de revue adverse](lens.html)
- [La revue avant la revue](../pourquoi-review-avant-review.html)
- [Le deep-dive review-before-review](../deep-dive/review-before-review.html)

## Sources

- Wiegers, K. *Peer Reviews in Software*, 2002.

Termes à connaître : **gate**, **reviewer**, **BLOCKER**, **INVEST**, **walking
skeleton** — voir le [glossaire](../glossaire.html).
