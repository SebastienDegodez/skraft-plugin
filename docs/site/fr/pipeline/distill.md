---
layout: doc
lang: fr
title: "DISTILL"
persona: software-engineer
---

# DISTILL

La phase DISTILL transforme les décisions d'architecture en spécifications exécutables.

## Mécanique

| | |
|---|---|
| **Trigger d'entrée** | Décisions d'architecture (sortie de DESIGN) |
| **Artefact de sortie** | Scénarios Gherkin + plan d'implémentation |
| **Agent responsable** | `acceptance-designer` |
| **Reviewer associé** | `acceptance-designer-reviewer` |

## Pourquoi cette phase existe

Les scénarios Gherkin servent de contrat entre le métier et le code. L'acceptance-designer écrit des scénarios Given-When-Then qui capturent le comportement attendu. Le reviewer vérifie que chaque critère d'acceptation est couvert et que les scénarios sont testables.

> « Specification by Example bridges the communication gap between business and technology. »
> — Adzic, G., *Specification by Example*, 2011.

## Ce que produit l'agent

- Fichiers `.feature` au format Gherkin avec Given-When-Then.
- Matrice de couverture liant chaque critère d'acceptation à un scénario.
- Plan d'implémentation ordonnant les tests par couche (Domain, Application, Infrastructure, API).
- Identification des Test Double nécessaires par frontière.

## Les gates franchies ici

Cette phase franchit les gates **G1–G8** (voir le [catalogue des gates](../catalogue/gates.html)).
Chaque gate est vérifiée par le reviewer indépendant avant le passage à **DELIVER**.
