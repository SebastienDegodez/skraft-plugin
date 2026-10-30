---
layout: doc
lang: fr
title: "DISCOVER"
description: "Pourquoi trier le backlog avant de choisir une story : priorité, doublons, effort en points et proposition de sprint, jugés par des lentilles qui n'ont pas fait le tri."
persona: software-engineer
---
{% assign cites = "/fr/reference/citations" | relative_url %}

# DISCOVER

{% include phase-ribbon.html current="discover" %}

> Trier avant de choisir : DISCOVER transforme un flux d'issues brutes en un rapport de triage
> priorisé et une proposition de sprint.

## Pourquoi cette phase existe

Sans tri systématique, une équipe travaille sur ce qui fait le plus de bruit, pas sur ce qui
a le plus de valeur. Les doublons passent inaperçus, une issue critique reste enfouie sous des
demandes récentes, et le sprint se remplit au-delà de ce que l'équipe peut tenir.

DISCOVER est la première phase du plugin `skraft-backlog`. Le développeur lance lui-même
l'agent `backlog-discoverer` ; le moteur d'ingénierie n'intervient pas. L'agent classe chaque
issue (type, priorité, effort), repère les doublons et les issues liées, puis propose un sprint
qui tient dans la capacité déclarée. Il étiquette les issues, mais n'en crée jamais et n'en
réécrit jamais le corps : le backlog reste celui de l'équipe.

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Fil rouge — Starbucks <em>(exemple illustratif)</em></span>

L'idée « permettre la commande mobile dans l'app » entre ici comme **issue brute**. DISCOVER la
priorise **P1**, détecte qu'elle recoupe une demande existante « paiement in-app », et la fait
sortir dans un **rapport de triage**. C'est ce rapport que DISCUSS recevra.
</div>

## Trois façons de trouver le travail

Le bon point de départ dépend de la question posée. « Qu'est-ce qui m'est assigné ? » part des
issues ouvertes du développeur ; « qu'est-ce que mes changements récents ont touché ? » part de
l'historique git de la semaine ; « qu'est-ce qui concerne ce thème ? » part d'une recherche par
labels, milestone ou mots-clés. Le discoverer choisit l'un de ces modes, et ses lentilles
vérifient qu'aucun n'a été écarté sans raison écrite.

## Des points, pas des jours

L'effort s'estime en points de Fibonacci (1, 2, 3, 5, 8). Un point mesure une complexité
relative, pas une durée. SKRAFT les convertit pourtant en jours-équipe, pour une seule raison :
la capacité de l'équipe arrive en jours, et deux unités ne se comparent pas sans passerelle.
Cette conversion est une convention locale, jamais une mesure ni une date promise.

Elle est construite pour pousser au découpage : le coût par point ne baisse jamais quand la
carte grossit. Une carte de 8 points vaut plus de jours que deux cartes de 3 et 5. Au-delà de
8, une carte doit être découpée avant d'entrer dans un sprint. C'est le principe des petits
lots : un lot plus petit réduit l'attente et le risque qu'il porte
([Reinertsen, 2009]({{ cites }}#cite-reinertsen-flow-2009)).

## Celui qui trie n'approuve pas son tri

Trois lentilles relisent le rapport, chacune en lecture seule et sous un seul angle :
complétude, priorisation, doublons. Un script, `review-verdict.mjs`, calcule le verdict à
partir de leurs findings ; le discoverer n'a pas voix au chapitre. Une lentille absente ou qui
ne conclut pas ne vaut jamais approbation. Après trois tentatives refusées, le run s'arrête et
rend la main au développeur avec les findings non résolus.

C'est la revue par les pairs ramenée à l'échelle d'un rapport de triage : plusieurs regards
indépendants, des critères écrits à l'avance
([Wiegers, 2002]({{ cites }}#cite-wiegers-peer-reviews-2002)).

## Pour aller plus loin

- [Le backlog]({{ "/fr/explanation/backlog" | relative_url }}) — le plugin `skraft-backlog` dans son ensemble.
- [Référence : DISCOVER]({{ "/fr/reference/phases" | relative_url }}#discover) — modes, sorties, plafond, effets sur GitHub.
- [Référence : critères de revue de DISCOVER]({{ "/fr/reference/gates" | relative_url }}#discover).
- [DISCUSS]({{ "/fr/explanation/pipeline/discuss" | relative_url }}) — la phase suivante.

## Sources

- [Reinertsen, D. G. *The Principles of Product Development Flow*, 2009.]({{ cites }}#cite-reinertsen-flow-2009)
- [Wiegers, K. *Peer Reviews in Software*, 2002.]({{ cites }}#cite-wiegers-peer-reviews-2002)
