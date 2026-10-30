---
layout: doc
lang: fr
title: "Adapter skraft : ce que coûte chaque réglage"
description: "Ce que skraft laisse adapter et ce qu'il garde dans le moteur, pourquoi, et la preuve que chaque réglage peut retirer sans que personne le remarque."
persona: tech-lead
---

# Adapter skraft : ce que coûte chaque réglage

> Le moteur fait tourner ce que vous écrivez. Il ne sait pas si votre commande teste vraiment
> quelque chose : chaque réglage qui adapte skraft peut aussi retirer une preuve.

## Ce que vous décrivez, ce que le moteur décide

skraft partage les rôles. Vous décrivez votre dépôt : ses composants, leurs commandes, leur base,
leur mocking, les modèles de vos agents, et, si vous copiez le workflow, vos propres lentilles,
agents et questions. Le moteur décide du reste : l'ordre des phases, les sorties attendues, le
nombre de tentatives, les verdicts, les gates et leurs seuils.

| Ce que vous adaptez | Où | Guide |
| --- | --- | --- |
| Composants, commandes, gates, base, mocking | `skraft-config.json` | [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }}) |
| Modèle et niveau de réflexion de chaque agent | `models`, `assign` (quatre couches) | [Choisir les modèles des agents]({{ "/fr/how-to/choose-models" | relative_url }}) |
| Lentilles d'une revue | `.skraft/pipeline.skraft.dot`, `.skraft/review.skraft.dot` | [Ajouter une lentille à une revue]({{ "/fr/how-to/customise-review" | relative_url }}) |
| Agents et questions de votre dépôt | `.skraft/pipeline.skraft.dot` | [Le workflow DOT]({{ "/fr/reference/workflow-dot" | relative_url }}) |
| Publication de la pull request et des captures | `publish` | [Publier la pull request d'un run]({{ "/fr/how-to/publish-pull-request" | relative_url }}) |

Ce qui ne se règle pas, et pourquoi :

- **Les seuils qualité.** Un seuil réglable devient un seuil négocié à chaque story difficile ;
  100 % sur le cœur métier et 80 % ailleurs restent les mêmes pour toutes les équipes.
- **Les contrôles du moteur** (journal chaîné, droits d'écriture, sorties attendues, rejeu des
  commits rouges). Ce ne sont pas des nœuds du workflow : aucune copie ne peut les retirer.
- **Les gates de DELIVER et les revues.** Les nœuds `gates` et `mutation` sont verrouillés :
  en retirer un exige d'écrire `unlock="<raison>"`, que `skraft workflow diff` montre et que le
  journal garde. Les fan-in des revues, l'appel `deliver_review` et les lentilles
  `test-integrity` et `architecture-boundaries` sont obligatoires : aucune raison ne les retire.

Le moteur rend donc certains contournements impossibles, et les autres visibles. Ce qu'il ne
peut pas voir, c'est une commande qui tourne et ne prouve rien.

## Risques — réduire les contrôles

| Ce que vous faites | Ce qui disparaît | Le signe à surveiller |
| --- | --- | --- |
| Retirer une gate d'un composant (`architecture`, `coverage`) | La preuve correspondante : plus de contrôle des dépendances, plus de couverture | La gate n'apparaît plus dans la sortie de `skraft gate` ni dans `gates/<composant>/` |
| Retirer une revue, l'appel à `review`, ou sa lentille `test-integrity` ou `architecture-boundaries` | Rien : le moteur refuse le workflow | `… this node is mandatory and cannot be removed` dans `skraft workflow check` |
| Déverrouiller le nœud `mutation` | Le mutation testing, et la boucle qui traite les mutants survivants | `skraft workflow diff` montre le déverrouillage ; le run journalise le nœud sauté avec sa raison |
| Supprimer la commande `mutation` d'un composant | Rien en silence : le run s'arrête à `mutation` en échec `environment` | La question `environment` sur le nœud `mutation` |
| Remplacer une commande par une qui ne teste rien (`"test": "node -e 0"`, un filtre qui exclut presque tout) | Toute la gate : elle passe à chaque fois | Une preuve `pass` dont `stdout` ne montre aucun test lancé |
| Passer un composant en `inprocess` sans test de contrat | La garantie que vos mocks ressemblent encore au vrai service | Des tests verts, puis une panne à l'intégration |
| Laisser un composant sans gate | Toute preuve sur ce composant ; le moteur le signale en échec `environment` | `no gate command; …` dans `skraft gate` |
| Fixer `--base` ou `baseBranch` sur une ref trop récente | Des fichiers modifiés hors du périmètre comparé | `no component changed since its base; no gate to run` alors que du code a changé |
| Retirer le nœud question `adr` | La ratification humaine des ADR, qui restent `Proposed` | `skraft workflow diff` montre le nœud disparu |
| Modifier `events.jsonl` à la main pour débloquer un run | Le journal comme preuve : le run est bloqué en `journal-tampered` | [Reprendre ou débloquer un run]({{ "/fr/how-to/resume-a-run" | relative_url }}) |

Avant de réduire un contrôle, écrivez la raison là où l'équipe la lira : la description de la
pull request, un ADR. Pour savoir si une gate prouve encore quelque chose, ouvrez sa preuve
(`.copilot-tracking/skraft-plans/<slug>/gates/<composant>/<gate>-<n>.log`) et lisez ce que la
commande a réellement fait.

## Le cas du mutation testing

Le mutation testing introduit de petites fautes dans le code et vérifie que les tests les
détectent (Jia & Harman, 2011). C'est la seule gate qui mesure les tests eux-mêmes : une
couverture de 100 % dit que le code a tourné, pas qu'un test aurait remarqué qu'il change. Le
retirer ne raccourcit pas seulement un run ; cela retire la preuve que les autres gates prouvent
quelque chose. C'est pourquoi son nœud est verrouillé plutôt qu'optionnel.

## Pour aller plus loin

- [Software craftsmanship]({{ "/fr/explanation/software-craftsmanship" | relative_url }}) —
  pourquoi un seuil fixe.
- [Architecture]({{ "/fr/explanation/architecture" | relative_url }}) — pourquoi ces décisions
  vivent dans le moteur.
- [Gates]({{ "/fr/reference/gates" | relative_url }}) et
  [nœuds verrouillés]({{ "/fr/reference/workflow-dot" | relative_url }}#locked-nodes).

## Sources

- Jia, Y. & Harman, M., *An Analysis and Survey of the Development of Mutation Testing*, 2011.
