---
title: "Le backlog : de l'idée à la story prête"
description: "Pourquoi la préparation produit vit dans un plugin à part, skraft-backlog : du PRD au backlog GitHub, le raffinement d'une issue, les automatisations de triage et de sprint, et les lentilles de planification qui décident si une story est prête."
persona: tech-lead
---

# Le backlog : de l'idée à la story prête

Le pipeline d'ingénierie part d'une story prête. `skraft-backlog` est la moitié de SKRAFT qui
la prépare — et qui refuse de la déclarer prête tant qu'elle ne l'est pas.

## Pourquoi un plugin à part

Préparer le travail et le réaliser n'ont ni le même rythme ni les mêmes acteurs. On trie le
backlog chaque semaine, on affine un sprint avant de le lancer, on découpe un PRD une fois ;
on conçoit et on livre une story à la fois. Les mêler dans un seul pipeline obligerait l'un à
attendre l'autre.

`skraft-backlog` est donc un plugin distinct, qui s'installe et tourne sans le plugin
d'ingénierie `skraft`, et inversement. Les deux ne partagent **aucun code** : ils partagent des
**fichiers**. Les stories que le backlog écrit dans le dossier de suivi sont celles que le moteur
sait lire, quel qu'en soit l'auteur ; `skraft init <slug> --from-artifacts` démarre alors un run
directement en DESIGN.

## Trois chemins vers une story prête

```mermaid
flowchart LR
    PRD["PRD approuvé"] -->|workflow<br/>skraft-prd-backlog| BL["epics + stories<br/>sur GitHub"]
    IS["issues existantes"] -->|backlog-discoverer| TR["triage +<br/>proposition de sprint"]
    TR -->|backlog-planner| ST["stories prêtes<br/>dans le dossier de suivi"]
    ONE["une issue"] -->|/skraft-refine (Claude Code)<br/>/skraft-backlog:skraft-refine (Copilot CLI)<br/>ou workflow gh-aw| CO["proposition de<br/>raffinement en commentaire"]
    ST -->|skraft init --from-artifacts| ENG["pipeline d'ingénierie<br/>en DESIGN"]
```

*Figure 1 — Les trois entrées de `skraft-backlog` : un PRD à découper, un backlog à trier et
affiner, une issue isolée à raffiner ; seules les stories du planner passent au moteur.*

### Du PRD au backlog

Quand un PRD est approuvé, le workflow dynamique Copilot CLI `skraft-prd-backlog` le transforme
en epics et en stories INVEST sur GitHub, avec leurs dépendances et leurs milestones. Le principe
du workflow tient en une phrase : **il ne décide rien qu'un script ou un humain décide.**

- Un script inventorie chaque exigence du PRD ; l'agent `backlog-slicer` découpe en epics et en
  stories ; un script vérifie que chaque exigence est couverte et que les dépendances forment un
  graphe sans cycle. Le run s'arrête alors sur la carte des stories, pour qu'un humain l'approuve.
- Un `story-writer` par story rédige chacune en parallèle ; un script la confronte à la
  Definition of Ready ; les quatre lentilles de planification la relisent.
- Le run s'arrête de nouveau : rien n'est publié tant qu'un humain n'a pas coché sa revue. La
  publication passe par `gh`, et chaque issue porte un marqueur caché : relancer le workflow ne
  crée rien deux fois.

La première story de chaque epic est sa **balle traçante** : le chemin le plus fin à travers
toutes les couches que l'epic touche, démontrable une fois fini. C'est l'idée des *tracer
bullets* ([Hunt & Thomas, 2019](../reference/citations.mdx#cite-hunt-pragmatic-2019)), cousine du walking
skeleton que DISTILL exige plus tard. Un canvas, *skraft backlog*, montre la carte et chaque
story comme une liste de contrôle. Marquer une story revue et la créer sur GitHub y sont des
actions de l'humain : l'agent peut lire l'état, expliquer une story et simuler la création,
jamais publier.

### Trier, puis affiner

Sur un backlog qui existe déjà, deux agents prennent le relais : `backlog-discoverer` trie et
propose un sprint ([DISCOVER](./pipeline/discover.md)), puis
`backlog-planner` affine les issues retenues en stories
([DISCUSS](./pipeline/discuss.md)). Le développeur lance chacun
comme agent principal de sa session ; c'est ce producteur qui lance ses lentilles, et aucun
sous-agent n'en lance un autre. Sous Copilot, `/skraft backlog [critères…]` est l'entrée de ce
chemin : elle ne lance aucun agent, elle dit au développeur quel agent choisir ensuite puis, les
stories écrites, de taper `/skraft <slug> --from-artifacts`. Elle ne passe jamais seule au
développement, car un routeur qui lancerait le producteur mettrait ses lentilles à la profondeur 2.
Comment faire : [Affiner le backlog](../how-to/refine-backlog.md).

### Raffiner une seule issue

Pour une issue isolée, `refinement-proposal` publie **un commentaire** : la Definition of Ready
de l'issue telle qu'elle est écrite, un verdict prête ou à affiner, une taille, les défauts des
critères actuels et une story proposée avec ses exemples. Le développeur la lance, sur son propre modèle, avec
`/skraft-refine <numéro>` sous Claude Code ou `/skraft-backlog:skraft-refine <numéro>` sous Copilot CLI
(mesuré ; VS Code non mesuré) ; une équipe peut aussi installer le workflow
GitHub Agentic `skraft-refine`, qui la lance à l'ouverture d'une issue ou sur un label. Un
marqueur dans le commentaire évite de proposer deux fois pour la même version de l'issue, et des
scripts font tout ce qui ne doit pas dépendre du modèle : retrouver le PRD lié, valider la
proposition, rendre le commentaire.

## Des automatisations qui donnent un rythme

Sous VS Code, le plugin propose deux modèles d'automatisation : un **triage hebdomadaire**, le
lundi matin, qui lance le discoverer et propose un sprint, et un **raffinement du sprint
proposé**, lancé à la main, qui fait passer ce sprint par le planner. Aucun n'est actif tant que
le développeur n'en a pas créé une automatisation, en choisissant lui-même le modèle et les
permissions. L'idée est de faire du tri un rendez-vous plutôt qu'une corvée qu'on repousse, sans
jamais lancer un agent que personne n'a autorisé.

## Les lentilles de planification : pourquoi chacune

Une story n'est pas « prête » parce que son auteur le dit. Quatre lentilles, chacune en lecture
seule, la jugent sous un angle précis, et le script `review-verdict.mjs` calcule le verdict.

- **INVEST** (G1, G2) : chaque story est indépendante, négociable, porteuse de valeur,
  estimable, petite et testable ([Wake, 2003](../reference/citations.mdx#cite-wake-invest-2003)), et le sprint
  ne contient pas de dépendance circulaire. Une story qui dépend en silence d'une autre trahit
  un découpage à revoir.
- **Qualité des critères d'acceptation** (G3, G4) : au moins trois critères, aucun qui dicte
  l'implémentation, et surtout aucun qu'un expert du domaine pourrait lire de deux façons. Un
  critère ambigu (G4) est bloquant : un code d'état HTTP, un nom de classe ou « le client est
  notifié » sans dire comment ne disent pas la même chose à tout le monde. Les exemples
  chiffrés de la spécification par l'exemple lèvent ces ambiguïtés
  ([Adzic, 2011](../reference/citations.mdx#cite-adzic-specification-2011)).
- **Cohérence** (G5, G6) : chaque story sert le thème de son milestone, et l'ordre de livraison
  se déduit sans ambiguïté du graphe des dépendances.
- **Definition of Ready** (G7, G8) : les huit points de la grille passent, et aucun
  anti-pattern n'apparaît — un persona développeur, un verbe « implémenter », pas d'exemple. Une
  story à laquelle manquent deux points de la grille ou plus est refusée d'office : elle n'est
  pas à corriger, elle est à réécrire.

Une lentille absente ou qui ne conclut pas ne vaut jamais approbation, et trois tentatives
refusées rendent la main au développeur. Le détail des critères et du calcul :
[Gates](../reference/gates.md#discuss).

## Les compromis

- **Le backlog reste celui de l'équipe.** Les agents posent des labels et des commentaires ;
  ils ne réécrivent jamais le titre ni le corps d'une issue.
- **Deux arrêts humains dans le workflow PRD.** La carte des stories et la publication attendent
  une personne. Un backlog publié par erreur coûte plus cher à nettoyer qu'une pause.
- **Pas de moteur côté backlog.** DISCOVER et DISCUSS n'ont ni journal d'événements ni gates de
  commandes : leurs contrôles sont des scripts et des lentilles, pas un run reprenable.

## Pour aller plus loin

- [Transformer un PRD en backlog GitHub](../how-to/prd-to-backlog.md) — le workflow `skraft-prd-backlog` pas à pas.
- [Raffiner une issue du backlog](../how-to/refine-backlog.md) — `/skraft-refine` et le workflow gh-aw.
- [Référence : DISCOVER et DISCUSS](../reference/phases.md#discover) — entrées, sorties, effets sur GitHub.
- [Référence : critères de revue de DISCOVER et DISCUSS](../reference/gates.md#discover).
- [Le catalogue des agents et skills](pathname:///dashboard/).
- [Le pipeline SKRAFT](./pipeline/index.mdx).

## Sources

- [Adzic, G. *Specification by Example*, 2011.](../reference/citations.mdx#cite-adzic-specification-2011)
- [Hunt, A. & Thomas, D. *The Pragmatic Programmer*, 20th anniversary ed., 2019.](../reference/citations.mdx#cite-hunt-pragmatic-2019)
- [Wake, B. *INVEST in Good Stories, and SMART Tasks*, 2003.](../reference/citations.mdx#cite-wake-invest-2003)
