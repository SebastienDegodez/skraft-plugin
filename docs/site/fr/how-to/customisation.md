---
layout: doc
lang: fr
title: "Personnaliser SKRAFT"
description: "Ce que vous pouvez adapter aujourd'hui en V2 (composants, commandes, base, mocking), ce qui arrive aux lots suivants, et le risque de chaque contrôle que vous réduisez."
persona: tech-lead
---

# Personnaliser SKRAFT

**But** : adapter SKRAFT à votre dépôt sans retirer, par mégarde, une preuve dont votre équipe dépend.

En V2, le **moteur** décide de l'ordre des phases, des sorties attendues, des relances, des verdicts et des gates. Vous ne réglez pas ces décisions ; vous décrivez votre dépôt dans `skraft-config.json`, et le moteur s'y tient.

## Ce que vous pouvez adapter aujourd'hui

Tout passe par `skraft-config.json`, à la racine de la copie de travail qui lance le run.

| Quoi | Où | Effet | Guide |
|---|---|---|---|
| Les composants | `components[]` : `name`, `root`, `stack` | Ce que le moteur construit et teste, y compris un dépôt voisin (`../payment-web`) | [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }}) |
| Les commandes | `commands` d'un composant | Une commande écrite par vous est **toujours** celle qui tourne ; le moteur ne la remplace jamais par un défaut | [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }}) |
| Les gates | les commandes nommées `build`, `format`, `lint`, `test`, `architecture`, `coverage`, `mutation` | Ce que `skraft gate` lance, dans cet ordre | [Lancer les gates]({{ "/fr/how-to/run-gates" | relative_url }}) |
| La base | `baseBranch` global ou par composant, `--base <ref>` à l'init | Le commit de comparaison : composants modifiés, `{baseSha}` dans les commandes | [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }}) |
| Le mocking | `mocking.strategy` : `"microcks"` ou `"inprocess"` | `microcks` (défaut) exige Docker pour les gates de test ; `inprocess` ne l'exige pas | [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }}) |

Ce qui ne se règle pas :

- Les **seuils qualité** ne sont pas configurables.
- L'ordre des phases, le nombre de tentatives d'un agent et les codes de blocage sont dans le moteur.
- Les clés `paths` et `contractTesting` d'un composant sont acceptées, mais le moteur ne les lit qu'à partir des lots 3 et 6.

Les autres clés de premier niveau de `skraft-config.json` sont conservées telles quelles par `skraft init`.

## Ce qui arrive

> **À venir.** Éjecter le workflow (graphe DOT) dans votre dépôt pour l'adapter : lot 3 ; ses gates de DELIVER seront verrouillées et ne se retireront qu'avec `unlock="<raison>"`. Agents et lentilles propres à votre dépôt : lots 3 et 4. Feuille de route complète : [Accueil]({{ "/fr/" | relative_url }}) ; pourquoi ces décisions restent dans le moteur : [Architecture]({{ "/fr/explanation/architecture" | relative_url }}).

## Risques — réduire les contrôles

Chaque réglage ci-dessus peut aussi **retirer une preuve**. Le moteur fait tourner ce que vous écrivez : il ne sait pas si votre commande teste vraiment quelque chose. Avant de réduire un contrôle, écrivez la raison quelque part où l'équipe la lira (la description de PR, un ADR).

| Ce que vous faites | Ce qui disparaît | Le signe à surveiller |
|---|---|---|
| Retirer une gate d'un composant (supprimer `mutation`, `architecture` ou `coverage`) | La preuve correspondante : plus de mutation testing, plus de contrôle des dépendances, plus de couverture | La gate n'apparaît plus dans la sortie de `skraft gate` ni dans `gates/<composant>/` |
| Remplacer une commande par une qui ne teste rien (`"test": "node -e 0"`, un script qui sort toujours 0, un filtre qui exclut presque tous les tests) | Toute la gate : elle passe à chaque fois, quel que soit le code | Une preuve `pass` dont `stdout` ne montre aucun test lancé |
| Passer un composant en `inprocess` sans test de contrat | La garantie que vos mocks ressemblent encore au vrai service ; les tests passent contre une dépendance imaginaire | Des tests verts, puis une panne à l'intégration |
| Laisser un composant sans gate | Rien ne prouve ce composant ; le moteur le signale en échec `environment` | `no gate command; …` dans la sortie de `skraft gate` |
| Fixer `--base` ou `baseBranch` sur une ref trop récente | Des fichiers modifiés hors du périmètre comparé : des composants touchés ne sont plus retenus par `skraft gate` | `no component changed since its base; no gate to run` alors que vous avez modifié du code |
| Modifier `events.jsonl` à la main pour débloquer un run | Le journal comme preuve : la chaîne casse et le run est bloqué en `journal-tampered` | Voir [Reprendre ou débloquer un run]({{ "/fr/how-to/resume-a-run" | relative_url }}) |

Pour vérifier qu'une gate prouve encore quelque chose, ouvrez sa preuve (`.copilot-tracking/skraft-plans/<slug>/gates/<composant>/<gate>-<n>.log`) et lisez ce que la commande a réellement fait.

Ce que mesure le mutation testing, et pourquoi le retirer coûte cher : [Glossaire]({{ "/fr/reference/glossary" | relative_url }}) (Jia & Harman, 2011).

## Voir aussi

- [Référence skraft-config.json]({{ "/fr/reference/skraft-config" | relative_url }})
- [Zéro hook, contrôles dans le moteur]({{ "/fr/explanation/hooks" | relative_url }})
- [Architecture : moteur et pilotes]({{ "/fr/explanation/architecture" | relative_url }})

## Sources

- Jia, Y. & Harman, M., *An Analysis and Survey of the Development of Mutation Testing*, 2011.
