---
layout: doc
lang: fr
title: "skraft-quality-bar"
description: "The single place a quality threshold is authored. States the permanent mutation and coverage bars and the enforcement level of every gate."
persona: tech-lead
---

# skraft-quality-bar

> Le seul endroit où un seuil est écrit. Toutes les autres mentions du framework y font référence au lieu de le redire.

## Quand l'utiliser

- Avant d'exécuter, de vérifier ou de rapporter un gate qualité
- Au moment de lancer un run de mutation
- Pour décider si un gate bloque ou se contente d'avertir — il bloque toujours
- À l'écriture ou à la relecture d'un enregistrement d'évidence
- Quand un autre skill ou descripteur semble énoncer un seuil qui lui serait propre
- Chaque fois qu'un nombre serait autrement recopié de mémoire ou d'un document plus ancien

## La barre

| Gate | Valeur | Portée |
|---|---|---|
| Score de mutation | 100% | Domain, Application |
| Score de mutation | 90% | API, Infrastructure |
| Couverture de lignes | 100% | Domain, Application |

Il n'y a pas de cadran de sévérité. Une version précédente du framework portait un réglage `depthTier` capable d'abaisser ces valeurs ; il a été supprimé, et avec lui les niveaux `advisory` et `warning` ainsi que la justification qui permettait d'obtenir une dérogation.

## Application

Tous les gates bloquent : frontières Clean Architecture, respect du cycle TDD, intégrité des tests, les deux portées de mutation, le Gherkin gate, un ADR pour toute décision non triviale, et les Object Calisthenics sur le Domain.

Un gate qui ne peut pas s'exécuter n'est pas un gate passé. Signalez-le comme un échec et arrêtez-vous.

## Exécuter le gate

La comparaison ne se fait jamais en lisant un nombre puis en le jugeant. Chaque adaptateur `quality-gates-<tech>` embarque deux scripts :

1. **Le cœur d'abord** — Domain et Application, attend 100
2. **La frontière ensuite** — API et Infrastructure, attend 90

Le cœur passe en premier et court-circuite : il n'y a rien à apprendre en mutant des adaptateurs tant que le domaine n'est pas prouvé. `--break-at` fait sortir le runner lui-même en non-zéro sous la barre, et ce code de sortie est le verdict.

## Invariants

- **Un seul point de définition** — un seuil est écrit ici et nulle part ailleurs ; les scripts d'adaptateur en portent une copie qu'un test de garde maintient égale à cette table
- **Aucune dérogation** — aucun réglage, palier ni justification n'abaisse la barre
- **Un code de sortie, pas une opinion** — un score lu dans un rapport puis comparé en prose n'est pas un gate

## Frontières

Ne choisit pas la commande de la chaîne d'outils (`resolving-stack-commands`), ne classe pas les survivants (`mutation-testing`), ne définit pas le schéma d'évidence (`quality-gates-evidence-contract`) et ne fixe pas le nombre de lentilles de revue — chaque skill de critères de revue possède le sien.
