---
layout: doc
lang: fr
title: "La revue avant la revue — pourquoi et comment"
description: "Le deep-dive review-before-review : la revue adverse assistée à 4 lentilles, la synthèse pondérée, et pourquoi elle filtre avant l'humain."
---

# La revue avant la revue — pourquoi et comment

> Avant que l'humain ne relise, un reviewer indépendant attaque le travail sous
> plusieurs angles et émet un verdict. La revue humaine reçoit alors un artefact déjà
> filtré — pas un brouillon.

## Le problème (contexte concret)

Quand la première relecture d'un changement est faite par un humain, elle consomme le
temps le plus cher de l'équipe sur des défauts qu'un contrôle systématique aurait pu
attraper : test qui n'assère rien, dépendance qui viole une frontière, critère
d'acceptation oublié. Le relecteur se fatigue sur le trivial et passe à côté du
subtil. Le cycle s'allonge à chaque aller-retour.

L'idée *review-before-review* : intercaler une revue **adverse assistée** entre la
production et la revue humaine. Elle ne remplace pas l'humain — elle lui livre un
travail déjà nettoyé des défauts détectables.

## Ce que disent les sources

Wiegers fonde toute revue sur des critères explicites et sur l'effet de plusieurs
regards.

> « Peer reviews are the single most effective quality practice a software organization can employ. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

Et sur la valeur de regards multiples et indépendants :

> « The combined attention of several reviewers finds defects a single reader misses. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

## Application dans SKRAFT

Chaque phase a un **reviewer indépendant** (jamais le producteur). En DELIVER, ce
reviewer applique **4 lentilles** indépendantes puis une **synthèse pondérée** (pattern
Genesis A7).

```text
Travail produit (phase N)
        │
        ▼
┌──────────────────────────── Reviewer indépendant ──────────────────────────┐
│  Lentille 1  cold-reader            ──► verdict + findings                  │
│  Lentille 2  architecture-boundaries ──► verdict + findings                 │
│  Lentille 3  test-integrity         ──► verdict + findings                  │
│  Lentille 4  quality-gates          ──► verdict + findings                  │
│                          │                                                  │
│                          ▼  synthèse pondérée                               │
│            APPROVED  /  CHANGES_REQUESTED  /  REJECTED                       │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
  (si APPROVED) transition de phase  ──►  revue humaine sur un artefact propre
```

Un seul BLOCKER sur une lentille suffit à renvoyer le travail (`CHANGES_REQUESTED`),
avec un nombre de reprises borné avant escalade humaine. Le verdict et ses findings
sont tracés — la revue humaine voit *pourquoi* c'est passé.

### Lentilles conditionnelles en DELIVER

Le panel n'est pas fixe : aux 4 lentilles CORE s'ajoutent des **lentilles de
fidélité** quand le `software-engineer` a délégué du câblage de test à un worker.
Si `mock-integration-worker` a posé un mock, `mock-fidelity-lens` rejoint le panel ;
si `contract-testing-worker` a posé un test de contrat, c'est `contract-fidelity-lens`.
Chacune attaque la **fidélité** du câblage (le mock/contrat reflète-t-il vraiment le
dépendant ?) et honore la même règle de BLOCKER. Voir le
[fan-out DELIVER]({{ "/fr/explanation/pipeline/deliver" | relative_url }}) et la
[catalogue agentique]({{ "/fr/dashboard/" | relative_url }}).

## Pièges & anti-patterns

- **Reviewer = producteur** : la revue perd son indépendance et son pouvoir de
  falsification.
- **Synthèse qui moyenne** : agréger les verdicts en « moyenne » au lieu d'honorer les
  BLOCKER laisse filer le critique.
- **Boucle infinie** : sans borne de reprises, un désaccord agent/reviewer ne remonte
  jamais à l'humain — SKRAFT borne et escalade.

## Sources

- Wiegers, K. *Peer Reviews in Software*, 2002.

Pour aller plus loin : [Les lentilles de revue]({{ "/fr/dashboard/" | relative_url }}),
[Les gates]({{ "/fr/reference/gates" | relative_url }}),
[La revue avant la revue (principe)]({{ "/fr/explanation/why-review-before-review" | relative_url }}).
