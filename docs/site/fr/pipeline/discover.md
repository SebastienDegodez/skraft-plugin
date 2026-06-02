---
layout: default
lang: fr
title: "DISCOVER"
persona: software-engineer
---

# DISCOVER

La phase DISCOVER transforme un flux brut d'issues en un rapport de triage priorisé et actionnable.

## Mécanique

| | |
|---|---|
| **Trigger d'entrée** | Nouvelle issue ou milestone à traiter |
| **Artefact de sortie** | Rapport de triage (priorité, labels, estimation d'effort) |
| **Agent responsable** | `backlog-discoverer` |
| **Reviewer associé** | `backlog-discoverer-reviewer` |

## Pourquoi cette phase existe

Sans triage systématique, les équipes travaillent sur ce qui fait le plus de bruit, pas sur ce qui a le plus de valeur. Le reviewer vérifie que la priorisation est cohérente et qu'aucun doublon n'a été ignoré.

> « Peer reviews are the single most effective quality practice a software organization can employ. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

## Ce que produit l'agent

- Classification par priorité (MoSCoW).
- Détection de doublons et d'issues liées.
- Estimation d'effort initiale.
- Proposition de sprint.
