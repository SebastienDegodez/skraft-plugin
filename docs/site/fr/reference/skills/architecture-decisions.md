---
layout: doc
lang: fr
title: "architecture-decisions"
description: "Use when documenting architecture decisions as ADRs, evaluating trade-offs between alternatives, or managing the life..."
persona: tech-lead
---

# architecture-decisions

> Documenter, évaluer et gérer le cycle de vie des Architecture Decision Records (ADRs) — mémoire institutionnelle des choix architecturaux avec analyse de compromis.

## Quand l'utiliser

- Pour documenter toute décision qui établit ou modifie une frontière de couche, choisit une frontière d'agrégat ou adopte un pattern complexe (CQRS+Bus, Event Sourcing, Saga, ACL)
- Pour évaluer les compromis entre alternatives avant une transition `Proposed → Accepted | Rejected`
- Pour gérer le cycle de vie : supersession, dépréciation, liaisons entre ADRs

## Contrat d'entrée

- Une story ou une force mesurable qui a soulevé la question (requis pour tout ADR)
- Le contexte architectural actuel (artefacts DESIGN de la phase en cours)
- Les contraintes et forces en jeu pour la décision

## Contrat de sortie

- Fichier ADR nommé `adr-{NNN}-{slug}.md` au statut `Proposed`
- Transition vers `Accepted` ou `Rejected` après ratification humaine (les deux commits sont gardés)
- En cas de supersession : mise à jour du registre `adrs/supersessions.md` ET de l'ADR successeur

## Invariants

- **Un ADR par décision** — une seule décision claire avec ses compromis
- **Jamais de verdict dans le nom de fichier** — le slug nomme le sujet, pas le verdict
- **Aucun ADR n'est jamais supprimé** — la trace historique est aussi précieuse que la décision
- **La ratification `Proposed → Accepted | Rejected` appartient à un humain**, pas à l'agent
- **Un ADR `Rejected` n'est licite que si une story du batch a soulevé la question**
- **Les conventions de la baseline ne font pas l'objet d'ADRs** (ex : CQS au niveau méthode, frontières Clean Architecture)

**Cycle de vie :**

```
Proposed → Accepted   → Deprecated
         ↘ Rejected   → Superseded by ADR-{NNN}
```

**Forces universelles à évaluer :**

| Force | Question |
|---|---|
| Simplicité | Est-ce que cela rend le système plus simple à comprendre et à modifier ? |
| Cohérence | Est-ce que cela s'inscrit dans les patterns déjà établis dans la base de code ? |
| Performance | Est-ce que cela satisfait les exigences de performance sans over-engineering ? |
| Testabilité | Est-ce que cela facilite ou complique les tests automatisés ? |
| Évolutivité | Est-ce que cela simplifie ou contraint les évolutions futures ? |

## Pourquoi cette forme

Les ADRs réduisent le coût de la dette architecturale en rendant explicite le raisonnement derrière chaque choix structurel. Sans eux, les équipes refont les mêmes débats avec les mêmes arguments — sans les contraintes originales qui les ont rendus nécessaires.

> « Every pattern has a context, a problem, and a solution. Without the context, a pattern is a hammer looking for nails. »
> — Evans, E., *Domain-Driven Design*, 2003.

## Customisation autorisée

- Template ADR (L1)
- Liste des forces supplémentaires à évaluer (L2)
- Canal de ratification humaine (L1 — le skill ne le prescrit pas)

## Voir aussi

- [architecture-patterns]({{ "/fr/reference/skills/architecture-patterns" | relative_url }}) — Catalogue des patterns à documenter en ADR
- [architecture-review-criteria]({{ "/fr/reference/skills/architecture-review-criteria" | relative_url }}) — Gates G1, G2, G14, G15 vérifient les ADRs
- [solution-architect]({{ "/fr/reference/agents/solution-architect" | relative_url }}) — Agent producteur des ADRs
