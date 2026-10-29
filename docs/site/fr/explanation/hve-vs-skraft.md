---
layout: doc
lang: fr
title: "HVE → SKRAFT : continuité et rupture"
description: "Comment SKRAFT prolonge HVE avec deux workflows produit autonomes, un pipeline d'ingénierie en quatre phases, des revues par lentilles indépendantes et des gates."
---

# HVE → SKRAFT : continuité et rupture

> SKRAFT ne remplace pas HVE — il le prolonge. Là où HVE outille la conversation entre un humain et l'IA, SKRAFT sépare la préparation produit du pipeline d'ingénierie et trace leurs artefacts.

## Pourquoi ce passage ?

HVE (Hypervelocity Engineering) fournit un workflow RPI (*Research → Plan → Implement*) efficace pour les développeurs travaillant en solo avec un assistant IA. Ce workflow suppose que la revue de qualité reste humaine et manuelle.

SKRAFT prend le relais quand vous souhaitez :
- **automatiser la revue adverse** avant qu'un humain intervienne,
- **tracer chaque décision** (artefacts, journal `events.jsonl`, verdicts),
- **passer à l'échelle** sur une équipe ou un backlog complet.

## Les deux couches SKRAFT

```mermaid
graph LR
    H((humain)) --> D[DISCOVER optionnel]
    D -->|rapport de triage| H
    H --> DI[DISCUSS optionnel]
    DI -->|story INVEST| H
    H --> O[skraft-orchestrator]
    O -->|si nécessaire| R[RESEARCH]
    R -->|recherche sourcée| DE[DESIGN]
    O -.séquence.-> DE
    DE -->|ADR + modèle d'événements| DIS[DISTILL]
    DIS -->|scénarios Gherkin| DEL[DELIVER]
    DEL -->|code + évidence| PR[Pull Request]
    style D fill:#1a3a2a,stroke:#4ed58a
    style DI fill:#1a3a2a,stroke:#4ed58a
    style DE fill:#1a3a2a,stroke:#4ed58a
    style DIS fill:#1a3a2a,stroke:#4ed58a
    style DEL fill:#1a3a2a,stroke:#4ed58a
    style PR fill:#102016,stroke:#6f8478
```

| Couche | Étape | Agent exécuteur | Revue indépendante |
|-------|-------|----------------|----------------------|
| Produit autonome (skraft-backlog) | DISCOVER | `backlog-discoverer` | 3 lentilles + `review-verdict.mjs` |
| Produit autonome (skraft-backlog) | DISCUSS | `backlog-planner` | 4 lentilles + `review-verdict.mjs` |
| Ingénierie orchestrée | RESEARCH | `solution-researcher` | aucune revue |
| Ingénierie orchestrée | DESIGN | `solution-architect` | 3 lentilles + verdict calculé par le moteur |
| Ingénierie orchestrée | DISTILL | `acceptance-designer` | 4 lentilles + verdict calculé par le moteur |
| Ingénierie orchestrée | DELIVER | `software-engineer` | quality gates + 3 lentilles + verdict calculé par le moteur |

> **Jargon** : une *gate* est un point de contrôle qui bloque la progression si la qualité n'est pas atteinte. Une *lentille* est un agent en lecture seule qui rapporte des findings sans modifier les artefacts ; le moteur en calcule le verdict. La [grille active des 49 gates]({{ "/fr/reference/gates" | relative_url }}) détaille les contrats actuels.

## HVE vs SKRAFT : tableau comparatif

| Dimension | HVE (RPI) | SKRAFT |
|-----------|-----------|-------------------|
| Périmètre | Une session de développement | Une User Story de bout en bout |
| Revue | Humaine et manuelle | Adverse assistée avant la revue humaine |
| Traçabilité | Limitée | journal chaîné `events.jsonl`, artefacts, verdicts horodatés |
| Lentilles | Non | Lentilles adverses par revue (DELIVER : test-integrity, architecture-boundaries, cold-reader) |
| Gates | Non | 49 gates explicites et non négociables |
| Passage à l'échelle | Solo / pair | Équipe, backlog complet |

## Ce qui ne change pas

SKRAFT **hérite** des principes de HVE :
- Le développeur reste maître des décisions.
- L'IA assiste, elle ne décide pas.
- La qualité est non négociable.

## Sources

> « Peer reviews are the single most effective quality practice a software organization can employ. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

## Voir aussi

- [Le pipeline]({{ "/fr/explanation/pipeline/" | relative_url }}) — préparation produit et ingénierie orchestrée
- [Les gates]({{ "/fr/reference/gates" | relative_url }}) — ce que chaque gate vérifie
- [Les lentilles]({{ "/fr/dashboard/" | relative_url }}) — le catalogue actif de la revue adverse
