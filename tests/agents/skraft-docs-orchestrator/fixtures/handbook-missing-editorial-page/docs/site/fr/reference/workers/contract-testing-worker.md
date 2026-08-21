---
layout: doc
lang: fr
title: "Worker contract-testing"
description: "Le subagent interne qui produit le test de contrat côté fournisseur."
sidebar_position: 1
---

# Worker contract-testing

Ce worker produit **toujours** le test d'intégration de base
(`WebApplicationFactory` + `HttpClient`) pour l'API de ce service. Quand
l'opt-in Microcks est posé, il **ajoute** la couche de vérification
`TestEndpointAsync(OPEN_API_SCHEMA)` par-dessus — elle ne remplace jamais la
base.

Il ne pilote pas le cycle RED→GREEN métier et ne bouchonne aucune dépendance
aval : ça, c'est l'autre worker.
