---
layout: doc
lang: fr
title: "DISCUSS"
description: "Pourquoi affiner une issue triée en story INVEST avec des exemples du domaine et des critères d'acceptation, avant toute conception, et pourquoi la Definition of Ready tranche."
persona: software-engineer
---
{% assign cites = "/fr/reference/citations" | relative_url %}

# DISCUSS

{% include phase-ribbon.html current="discuss" %}

> Préciser avant de concevoir : DISCUSS fait d'une issue triée une story que le métier et le
> code comprennent de la même façon.

## Pourquoi cette phase existe

Une story floue produit du code qui résout le mauvais problème, et l'écart ne se voit qu'à la
démo. DISCUSS déplace cette découverte en amont : avant toute architecture, la story doit dire
pour qui, quoi et pourquoi, avec des exemples que le métier reconnaît.

C'est la seconde phase du plugin `skraft-backlog`. Le développeur lance l'agent
`backlog-planner` sur le rapport de triage de DISCOVER (ou sur un triage venu d'une
planification amont). Le planner ne touche ni au code ni au moteur : il écrit des stories dans
le dossier de suivi et pose sur chaque issue un label qui dit si elle est prête.

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Fil rouge — Starbucks <em>(exemple illustratif)</em></span>

Le rapport de triage entre. DISCUSS en tire la **story INVEST** : « En tant que client, je
commande une boisson personnalisée pour la récupérer en magasin. » Elle sort accompagnée de
**3 critères d'acceptation** (choix de la taille, du lait, et paiement avant préparation).
L'ingénierie recevra cette story.
</div>

## Des exemples avant des règles

Le planner part d'exemples concrets du domaine, avec de vraies valeurs, puis en dérive les
critères d'acceptation au format *Given / When / Then*. L'ordre compte : un exemple chiffré
révèle un désaccord qu'une règle abstraite cache. C'est l'idée de la spécification par
l'exemple ([Adzic, 2011]({{ cites }}#cite-adzic-specification-2011)) et du vocabulaire
*Given / When / Then* du BDD ([North, 2006]({{ cites }}#cite-north-bdd-2006)).

La story elle-même suit INVEST : indépendante, négociable, porteuse de valeur, estimable,
petite, testable ([Wake, 2003]({{ cites }}#cite-wake-invest-2003)). Elle nomme un rôle précis,
jamais « l'utilisateur » : un persona vague laisse chacun imaginer le sien.

## Prête, ou pas encore

La **Definition of Ready** est la grille qui décide si une story peut partir en ingénierie :
problème énoncé, persona précis, exemples, scénarios, critères dérivés des exemples, taille,
notes techniques, dépendances. Une story qui ne la passe pas reste en raffinement, avec le
label qui le dit, plutôt que d'entrer dans un sprint sous une forme que DESIGN devrait deviner.

Quatre lentilles relisent les stories — INVEST, qualité des critères, cohérence du milestone et
des dépendances, Definition of Ready — et le script `review-verdict.mjs` calcule le verdict,
comme en DISCOVER. Le planner ne valide jamais ses propres stories.

## Pour aller plus loin

- [Le backlog]({{ "/fr/explanation/backlog" | relative_url }}) — pourquoi chaque lentille de planification existe.
- [Référence : DISCUSS]({{ "/fr/reference/phases" | relative_url }}#discuss) — entrées, sorties, labels.
- [Référence : critères de revue de DISCUSS]({{ "/fr/reference/gates" | relative_url }}#discuss).
- [RESEARCH]({{ "/fr/explanation/pipeline/research" | relative_url }}) — où l'ingénierie commence.

## Sources

- [Adzic, G. *Specification by Example*, 2011.]({{ cites }}#cite-adzic-specification-2011)
- [North, D. *Introducing BDD*, 2006.]({{ cites }}#cite-north-bdd-2006)
- [Wake, B. *INVEST in Good Stories, and SMART Tasks*, 2003.]({{ cites }}#cite-wake-invest-2003)
