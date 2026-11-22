---
title: "Lancer la mutation sur sa branche"
description: "Déclarer la commande de mutation de chaque composant, puis lancer la mutation sur sa branche avec le skill skraft-mutation et tuer les survivants."
persona: software-engineer
---

# Lancer la mutation sur sa branche

Le mutation testing est le vôtre : ni le pipeline d'une story ni le moteur ne le lancent. Déclarez la
commande une fois, puis lancez-la sur votre branche quand vous le décidez, dans votre propre session,
avec le skill `skraft-mutation`.

## Prérequis

- Un `skraft-config.json` avec ses composants ([Configurer les composants](./configure-components.md)).
- Votre branche extraite.

## 1. Déclarer la commande de mutation de chaque composant

Demandez `/skraft-init mutation` à votre agent, ou écrivez-les vous-même sous `commands.mutation` de
chaque composant dans `skraft-config.json`. skraft ne détient aucune commande de mutation d'aucune
pile : l'agent en propose une par composant, que vous confirmez ou réécrivez. Rien n'est installé :
Stryker, PIT ou mutmut, et leur configuration, sont à vous d'ajouter. Pour laisser un composant de
côté, ne lui donnez pas de clé `mutation`.

La commande écrit son résultat, score déjà calculé, dans le fichier que nomme la variable
d'environnement `SKRAFT_MUTATION_RESULT`, ou laisse le rapport que son outil écrit au chemin par défaut
de l'outil ([Le résultat de mutation](../reference/skraft-config.md#mutation-result)). Le seuil est de
80 % pour chaque périmètre.

## 2. Lancer la recette

Demandez à votre agent de lancer la mutation sur votre branche : il charge le skill `skraft-mutation`.
La recette :

1. Pour chaque composant qui a une `commands.mutation`, lancer la commande dans Bash depuis la racine
   du composant.
2. Lire le rapport que laisse la commande.
3. Juger chaque périmètre (le cœur, la frontière) au seuil, sur les fichiers que votre branche a
   modifiés depuis sa base de fusion.
4. Tuer les survivants par des tests, puis relancer la commande.

Le moteur n'en lance rien et n'en journalise rien.

## 3. Lire le verdict

Un périmètre au seuil ou au-dessus passe. En dessous, les survivants des fichiers modifiés sont le
travail restant : chacun est tué par un test qui échoue sur lui, jamais par un test écrit pour le seul
mutant.

## S'en passer

Retirez la clé `mutation` de chaque composant : le skill n'a alors rien à lancer et le dit. Pour
changer le workflow lui-même, éjectez-le : [Éjecter le workflow](./eject-workflow.mdx).

## Dépannage

| Symptôme | Que faire |
| --- | --- |
| Le skill ne trouve aucune commande de mutation | étape 1 |
| Le rapport de la commande est illisible | vérifier le chemin du rapport, ou faire écrire `SKRAFT_MUTATION_RESULT` à la commande |
