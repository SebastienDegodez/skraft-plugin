---
layout: doc
lang: fr
title: "DESIGN"
description: "Pourquoi DESIGN rend chaque décision d'architecture explicite, la réutilise avant d'en créer, la fait relire par des lentilles puis ratifier par un humain avant toute spécification."
persona: software-engineer
---
{% assign cites = "/fr/reference/citations" | relative_url %}

# DESIGN

{% include phase-ribbon.html current="design" %}

> Décider, l'écrire, le faire ratifier : DESIGN traduit une story en décisions d'architecture
> explicites, et aucune n'entre en spécification sans qu'un humain l'ait acceptée.

## Pourquoi cette phase existe

Sans décisions explicites, chaque développeur — et chaque agent — invente sa propre structure,
et la suivante la contredit sans le savoir. DESIGN fixe la forme de la solution avant d'écrire
un test : le `solution-architect` modélise le flux de la story en événements, place les
frontières de contexte, choisit les patterns, puis consigne chaque décision structurante dans
un **ADR** (Architecture Decision Record) avec son contexte, ses options et ses conséquences.

Le modèle n'est pas un livrable de plus : c'est le langage que l'équipe, le métier et le code
partagent ([Evans, 2003]({{ cites }}#cite-evans-ddd-2003)). Le pourquoi de cette démarche, du
langage omniprésent aux agrégats, est développé dans
[Domain-Driven Design]({{ "/fr/explanation/domain-driven-design" | relative_url }}) ; la règle de
dépendance que les contrats respectent, dans
[Clean Architecture]({{ "/fr/explanation/clean-architecture" | relative_url }}).

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Fil rouge — Starbucks <em>(exemple illustratif)</em></span>

La story de commande entre. DESIGN propose un **ADR** « déléguer le paiement à un fournisseur
externe via une couche anti-corruption (ACL) » et un **modèle d'événements** `PasserCommande` →
`CommandePayée` → `CommandePrête`. Un humain ratifie l'ADR ; ce modèle alimente DISTILL.
</div>

## Réutiliser avant de créer

L'architecte ne repart pas de zéro. Il reçoit le document de RESEARCH et un **scan structurel**
que le moteur écrit avant chacune de ses tentatives : les agrégats, contextes et patterns déjà
présents dans le code des composants. Sa première étape classe chaque élément existant —
réutilisé tel quel, étendu ou nouveau — en citant la recherche ou le scan, et il ne fouille le
code que pour ce qu'ils laissent ouvert. Un engagement que le scan détecte sans ADR accepté qui
le couvre reçoit un ADR de rattrapage : il devient une décision écrite, pas un fait accompli.

Avant le code, il lit ce que les stories précédentes ont laissé dans le dépôt : la context map,
la conception tactique de chaque contexte et le modèle d'événements sous `docs/`, et les ADR. Il
complète ces fichiers sur la branche de la story plutôt que de les réécrire, pour que la pull
request montre ce qui a changé dans le modèle. Quand ils couvrent déjà la story, l'architecte le
dit dans sa matrice de cohérence, les cite et passe à la suite.

Ce choix économise des tokens, mais surtout il empêche une conception qui ignore l'existant :
c'est la même source, le scan, que les lentilles relisent ensuite.

## Relire, puis faire ratifier

Trois lentilles relisent la conception, chacune dans un contexte neuf : la **cohérence** entre
ADR, diagrammes, contrats et modèle d'événements ; la **conformité** à l'architecture (la règle
de dépendance, la place des interfaces, les relations entre contextes) ; l'**adéquation** des
patterns, qui refuse tout agrégat ou pattern qu'aucune story ne justifie. Le moteur vérifie en
plus, sans lentille, les traces qu'un humain ne devrait pas avoir à relire : matrice de
cohérence, nommage et registre des ADR remplacés, index des décisions, et règles des ADR (aucune version, une décision d'une phrase, un vocabulaire de statut fermé, un ADR publié modifié seulement sur ses lignes de statut).

La revue a lieu **avant** la ratification. Un humain ne relit ainsi que des ADR déjà
cohérents ; il répond `RATIFIED` ou `REJECTED` avec une raison qui repart chez l'architecte.
Seul le moteur passe un ADR en `Accepted`, après cette réponse. Aucun agent ne peut ratifier à
la place de l'humain : une décision d'architecture engage l'équipe, pas le modèle qui l'a
proposée.

## Les compromis

- **Le run attend un humain.** Sans réponse, il reste en attente ; c'est voulu. Un ADR accepté
  par défaut ne serait qu'une suggestion.
- **Un ADR publié ne se réécrit pas en silence.** Une fois sur la branche de base, il se
  remplace ou s'amende ; tant qu'il ne l'est pas, on le corrige sur place. L'historique des
  décisions reste lisible sans se remplir d'ADR mort-nés.

## Pour aller plus loin

- [Référence : DESIGN]({{ "/fr/reference/phases" | relative_url }}#design) — nœuds, sorties, contrôles du moteur, arêtes.
- [Référence : critères de revue de DESIGN]({{ "/fr/reference/gates" | relative_url }}#design).
- [Référence : ADR non publiés]({{ "/fr/reference/run-journal" | relative_url }}#unpublished-adrs).
- [Référence : documentation durable]({{ "/fr/reference/run-journal" | relative_url }}#durable-docs) — ce qui va dans `docs/`, ce qui reste dans le dossier de suivi.
- [DISTILL]({{ "/fr/explanation/pipeline/distill" | relative_url }}) — la phase suivante.

## Sources

- [Evans, E. *Domain-Driven Design*, 2003.]({{ cites }}#cite-evans-ddd-2003)
