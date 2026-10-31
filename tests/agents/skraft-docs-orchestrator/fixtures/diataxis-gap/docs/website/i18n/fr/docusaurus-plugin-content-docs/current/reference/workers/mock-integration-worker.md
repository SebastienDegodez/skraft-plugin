---
layout: doc
lang: fr
title: "Worker mock-integration"
description: "Le subagent interne qui bouchonne la dépendance aval appelée par le système sous test."
sidebar_position: 2
---

# Worker mock-integration

Ce worker résout une stratégie de bouchonnage (`microcks` par défaut,
`inprocess` en surcharge) croisée avec la stack, puis produit le câblage du
mock aval et l'échafaudage du test d'intégration.

Il ne pilote pas le cycle RED→GREEN métier et ne vérifie aucun contrat côté
fournisseur : ça, c'est l'autre worker.
