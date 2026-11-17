---
title: "Lancer la mutation sur sa branche"
description: "Déclarer la commande de mutation de chaque composant, muter sa branche à part de toute story, tuer les survivants, lire le verdict, ou s'en passer."
persona: software-engineer
---

# Lancer la mutation sur sa branche

Le test de mutation vous appartient : aucun pipeline de story ne mute. Déclarez la commande une
fois, lancez-la sur votre branche quand vous le choisissez, et laissez skraft confier les mutants
survivants à des agents qui proposent puis écrivent les tests qui les tuent.

## Prérequis

- Un `skraft-config.json` avec ses composants ([Configurer les composants](./configure-components.md)).
- Votre branche extraite : un run de mutation est celui de la branche où se trouve HEAD.
- Un terminal à la racine de la copie de travail ; `skraft` est la commande que [`npm i -g @skraft/cli`](./install-on-a-host.mdx#skraft-command) installe ; la ligne longue `node "<dossier du plugin>/engine/drivers/cli/skraft.mjs"` marche sans elle.

## 1. Déclarer la commande de mutation de chaque composant

Demandez `/skraft-init mutation` à votre agent, ou écrivez-les vous-même :

```console
$ skraft init --mutation
skraft-config.json already lists every project found (2 components); mutation: api, web
```

Il écrit la commande de chaque stack ([les défauts](../reference/skraft-config.md)) aux
composants qui n'en ont pas, et garde une commande que vous avez écrite. Il n'installe rien :
Stryker, PIT ou mutmut, et leur configuration, sont à vous. Pour laisser un composant de côté,
retirez sa clé `mutation`.

La commande écrit son résultat, score déjà calculé, dans le fichier que nomme la variable
d'environnement `SKRAFT_MUTATION_RESULT`, ou laisse le rapport de son outil à son chemin par défaut
([Le résultat de mutation](../reference/skraft-config.md#mutation-result)). La barre est de 80 %
pour chaque périmètre.

## 2. Lancer la mutation sur sa branche

Depuis votre agent : `/skraft-mutation`. Depuis un terminal :

```console
$ skraft mutation
```

Le run vit dans `.copilot-tracking/skraft-mutation/<branche>/`, à part de tout pipeline. La
commande de chaque composant tourne contre sa merge base, changements non commités compris. Un
périmètre à la barre ou au-dessus termine le run là.

## 3. Tuer les survivants

Sous la barre, le run confie un agent de proposition par fichier de survivants (`dispatch`).
L'agent que votre hôte conduit les lance et enregistre leurs réponses, puis :

```console
$ skraft mutation record
```

Le run vous demande alors le plan (`mutation-plan`). Votre agent le pose dans le chat et relaie
votre réponse par l'outil `skraft_mutation` ; depuis un terminal, répondez vous-même :

```console
$ skraft mutation decide APPLY
```

`APPLY` fait écrire les propositions en tests, revus, passés aux gates, puis mutés de nouveau ;
une instruction entre guillemets les remplace ; `STOP` termine le run. Relancez
`skraft mutation` pour continuer.

## 4. Lire le verdict

```console
$ skraft doctor
ok    mutation: api, web declare a mutation command; last run on feat/refund: mutation passed (core 86 %, boundary 92 %), ended
```

Un verdict en échec est un avertissement, jamais un échec. Le `skraft mutation` suivant repart
de zéro sur le code tel qu'il est.

## S'en passer

Retirez la clé `mutation` de chaque composant : `skraft mutation` refuse alors avec
`no-mutation-command`, et doctor dit qu'aucun composant n'en déclare. Pour changer le workflow
lui-même, éjectez-le : [Éjecter le workflow](./eject-workflow.mdx).

## Dépannage

| Refus | Que faire |
| --- | --- |
| `detached-head` | extraire la branche à muter, puis relancer |
| `no-mutation-command` | l'étape 1 |
| `refused (not-recorded)` | lancer les agents listés, enregistrer leurs réponses, puis `skraft mutation record` |
| `environment` sur la gate de mutation | la commande n'a pas tourné ou son résultat est illisible : la raison nomme le fichier ; corrigez la commande, vérifiez-la avec `skraft doctor` |
