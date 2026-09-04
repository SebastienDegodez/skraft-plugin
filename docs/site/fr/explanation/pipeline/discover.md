---
layout: doc
lang: fr
title: "DISCOVER"
persona: software-engineer
---

# DISCOVER

{% include phase-ribbon.html current="discover" %}

La phase DISCOVER transforme un flux brut d'issues en un rapport de triage priorisé et actionnable.

## Ce qui entre, ce qui sort

| | |
|---|---|
| **Vient de** | — (entrée du pipeline) : un flux d'issues |
| **Ce qui entre** | Issue brute ou milestone à traiter |
| **Ce qui sort** | Rapport de triage priorisé (priorité, labels, effort) |
| **Va vers** | **DISCUSS** — qui raffine les issues retenues en stories |
| **Agent responsable** | `backlog-discoverer` |
| **Reviewer associé** | `backlog-discoverer-reviewer` |

## Pourquoi cette phase existe

Sans triage systématique, les équipes travaillent sur ce qui fait le plus de bruit, pas sur ce qui a le plus de valeur. Le reviewer vérifie que la priorisation est cohérente et qu'aucun doublon n'a été ignoré.

> « Peer reviews are the single most effective quality practice a software organization can employ. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Fil rouge — Starbucks <em>(exemple illustratif)</em></span>

L'idée « permettre la commande mobile dans l'app » entre ici comme **issue brute**. DISCOVER la priorise **P1**, détecte qu'elle recoupe une demande existante « paiement in-app », et la fait sortir dans un **rapport de triage**. C'est ce rapport que DISCUSS recevra.
</div>

## Ce que produit l'agent

- Classification par priorité (MoSCoW).
- Détection de doublons et d'issues liées.
- Estimation d'effort initiale, en points Fibonacci (1, 2, 3, 5, 8).
- Proposition de sprint.

Les points ne sont pas des jours. Un point mesure une complexité relative, pas une durée.
SKRAFT les convertit en jours-équipe pour une seule raison : la capacité arrive en jours,
et deux unités ne se comparent pas sans passerelle. La conversion est une convention
locale du dépôt — jamais une mesure, jamais une prévision, jamais une date.

| Points | Jours-équipe |
|---|---|
| 1 | 0,25 |
| 2 | 0,5 |
| 3 | 0,75 |
| 5 | 1,5 |
| 8 | 3 |
| 13 et 21 | à découper avant le sprint |

Le coût par point ne redescend jamais quand la carte grossit. Découper une carte de
8 points en 3 + 5 coûte 2,25 jours au lieu de 3 : le découpage est arithmétiquement
moins cher que le report.

## Les gates franchies ici

Cette phase franchit les gates **G1–G6** (voir le [catalogue des gates]({{ "/fr/reference/gates" | relative_url }})).
Chaque gate est vérifiée par le reviewer indépendant avant le passage à **DISCUSS**.
