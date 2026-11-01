---
title: "Le pipeline SKRAFT"
description: "Pourquoi SKRAFT sépare la préparation produit du pipeline d'ingénierie, pourquoi chaque phase passe un artefact à la suivante, et par quelle page d'explication commencer."
persona: tech-lead
---

# Le pipeline SKRAFT

SKRAFT n'impose pas une chaîne unique : il propose des parcours, et dans chacun la sortie
d'une étape devient l'entrée de la suivante.

## Pourquoi plusieurs parcours

Une équipe n'arrive pas toujours au même endroit. Tantôt la story est prête, tantôt le backlog
est un tas d'issues brutes, tantôt il n'y a que du code hérité sans intention écrite. Un seul
pipeline pour ces trois cas forcerait soit à inventer une story là où il n'y en a pas, soit à
sauter des contrôles là où elle existe déjà.

SKRAFT sépare donc trois choses :

- **la préparation produit** — DISCOVER puis DISCUSS, dans le plugin `skraft-backlog`. Elle est
  optionnelle et le développeur la lance lui-même ; voir [Le backlog](../backlog.md) ;
- **le pipeline d'ingénierie** — RESEARCH, DESIGN, DISTILL, DELIVER puis la publication, que le
  moteur conduit pour une story affinée ; l'agent `skraft-orchestrator` ne fait que le démarrer
  ou le reprendre ;
- **le parcours Brownfield** — un parcours frère pour reprendre un existant, pas une phase
  préliminaire ; voir [Reprendre un existant](../brownfield.md).

Les deux plugins partagent des fichiers, jamais du code : les stories que DISCUSS écrit dans le
dossier de suivi sont celles que le moteur sait lire. Chacun s'installe et tourne sans l'autre.

## Le flux d'artefacts

Dans le parcours principal, le fil conducteur n'est pas un agent mais un **artefact** : chaque
phase lit ce que la précédente a écrit, et le moteur vérifie que la sortie attendue est bien là
avant d'avancer.

```mermaid
graph LR
    D[DISCOVER<br/>optionnel] -.->|rapport de triage| DI[DISCUSS<br/>optionnel]
    DI -.->|stories prêtes| R[RESEARCH]
    R -->|recherche sourcée| DE[DESIGN]
    DE -->|ADR ratifiés,<br/>modèle d'événements| DIS[DISTILL]
    DIS -->|tests d'acceptation<br/>en échec| DEL[DELIVER]
    DEL -->|code revu,<br/>mutation passée| P[PUBLISH]
```

*Figure 1 — Le flux d'artefacts du parcours principal : en pointillé, la préparation produit
optionnelle ; en trait plein, les phases que conduit le moteur.*

Ce choix a une conséquence : une phase ne peut pas « se souvenir » d'une décision qu'elle n'a
pas écrite. Ce qui n'est pas dans un artefact n'existe pas pour la phase suivante, ce qui rend
chaque relais relisible par un humain. Quand les stories viennent déjà de DISCUSS,
`skraft init <slug> --from-artifacts` démarre le run en DESIGN : la recherche a eu lieu en amont.

:::info[☕ Fil rouge — Starbucks *(exemple illustratif)*]

Pour voir ce flux en action, suivez une même demande — « commander et payer une boisson dans
l'app Starbucks » — de l'idée au code, phase par phase :
[Suivez un exemple de bout en bout](./fil-rouge.md).
:::

## Ce que chaque phase apporte

- [DISCOVER](./discover.md) — trier avant de choisir :
  savoir ce qui mérite d'être travaillé.
- [DISCUSS](./discuss.md) — préciser avant de
  concevoir : une story que le métier et le code comprennent de la même façon.
- [RESEARCH](./research.md) — chercher des preuves
  avant de décider.
- [DESIGN](./design.md) — décider l'architecture et la
  faire ratifier par un humain.
- [DISTILL](./distill.md) — écrire le contrat
  exécutable, en échec, avant le code.
- [DELIVER](./deliver.md) — faire passer ce contrat au
  vert en petits pas prouvés, puis tester les tests.

Les entrées, sorties, chemins, agents, lentilles et arêtes de retour de chaque phase sont dans la
référence [Phases](../../reference/phases.md) ; ce que vérifie chaque gate,
dans [Gates](../../reference/gates.md).

## Pourquoi chaque phase a sa revue

Celui qui produit un artefact n'est pas celui qui le juge. DESIGN, DISTILL et DELIVER passent
devant des lentilles de revue en lecture seule ; DISCOVER et DISCUSS ont leurs propres lentilles
dans `skraft-backlog`. RESEARCH n'a pas de revue : le moteur vérifie seulement que son document
est rempli, et DESIGN, qui le lit, en reste juge. C'est l'idée de la revue par les pairs
appliquée à chaque relais : un défaut attrapé à la phase qui l'a introduit coûte moins qu'à la
suivante ([Wiegers, 2002](../../reference/citations.mdx#cite-wiegers-peer-reviews-2002)). Le raisonnement complet :
[La revue avant la revue](../deep-dive/review-before-review.md).

## Les pages d'explication

**Orientation et parcours**

- [Le fil rouge](./fil-rouge.md) — un exemple suivi de bout en bout.
- [L'équipe et les relais](./team.md) — qui produit, qui juge, qui lance.
- [Le backlog](../backlog.md) — le plugin `skraft-backlog` et ses automatisations.
- [Reprendre un existant](../brownfield.md) — le parcours Brownfield.

**Comprendre le système**

- [Architecture](../architecture.md) — un moteur neutre, des pilotes par hôte.
- [Le journal d'événements](../event-journal.md) — pourquoi `events.jsonl` a remplacé l'état écrit.
- [Garde-fous](../guardrails.md) — pourquoi les contrôles vivent dans le moteur et non dans des hooks.
- [Économie de tokens](../token-economy.md) — pourquoi le coût se décide au design.

**Fondations du craft**

- [Software craftsmanship](../software-craftsmanship.md),
  [Domain-Driven Design](../domain-driven-design.md),
  [Clean Architecture](../clean-architecture.md).

**Approfondissements**

- [La revue avant la revue](../deep-dive/review-before-review.md),
  [Outside-In TDD](../deep-dive/outside-in-tdd.md),
  [Walking Skeleton](../deep-dive/walking-skeleton.md),
  [Mocking avec Microcks](../deep-dive/mocking-microcks.md),
  [Contract testing](../deep-dive/contract-testing.md),
  [Lire un verdict d'évaluation](../deep-dive/reading-a-verdict.md).

**Pour décideurs**

- [Pour décideurs](../for-executives.md).

## Sources

- [Wiegers, K. *Peer Reviews in Software*, 2002.](../../reference/citations.mdx#cite-wiegers-peer-reviews-2002)
