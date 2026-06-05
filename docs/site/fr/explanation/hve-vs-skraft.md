---
layout: doc
lang: fr
title: "HVE → SKRAFT : continuité et rupture"
description: "Comment SKRAFT prolonge HVE en remplaçant le workflow RPI par un pipeline SDLC complet : 5 phases, reviewers indépendants, gates et lentilles."
---

# HVE → SKRAFT : continuité et rupture

> SKRAFT ne remplace pas HVE — il le prolonge. Là où HVE outille la conversation entre un humain et l'IA, SKRAFT structure l'ensemble du cycle de vie d'une User Story, de la découverte à la livraison.

## Pourquoi ce passage ?

HVE (Hypervelocity Engineering) fournit un workflow RPI (*Research → Plan → Implement*) efficace pour les développeurs travaillant en solo avec un assistant IA. Ce workflow suppose que la revue de qualité reste humaine et manuelle.

SKRAFT prend le relais quand vous souhaitez :
- **automatiser la revue adverse** avant qu'un humain intervienne,
- **tracer chaque décision** (artefacts, `state.json`, verdicts),
- **passer à l'échelle** sur une équipe ou un backlog complet.

## Le pipeline SKRAFT en 5 phases

```mermaid
graph LR
    D[DISCOVER] -->|rapport de triage| DI[DISCUSS]
    DI -->|story INVEST| DE[DESIGN]
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

| Phase | Agent exécuteur | Reviewer indépendant | Gates franchies |
|-------|----------------|----------------------|-----------------|
| DISCOVER | `backlog-discoverer` | `backlog-discoverer-reviewer` | G1–G6 |
| DISCUSS | `backlog-planner` | `backlog-planner-reviewer` | G1–G8 |
| DESIGN | `solution-architect` | `solution-architect-reviewer` | G1–G15 |
| DISTILL | `acceptance-designer` | `acceptance-designer-reviewer` | G1–G8 |
| DELIVER | `software-engineer` | `software-engineer-reviewer` | gates de livraison |

> **Jargon** : un *gate* est un point de contrôle qui bloque la progression si la qualité n'est pas atteinte. Un *reviewer* est un agent en lecture seule qui émet un verdict sans modifier les artefacts (principe CQS). Le [détail des 46 gates]({{ "/fr/reference/gates" | relative_url }}) est dans le catalogue.

## HVE vs SKRAFT : tableau comparatif

| Dimension | HVE (RPI) | SKRAFT (5 phases) |
|-----------|-----------|-------------------|
| Périmètre | Une session de développement | Une User Story de bout en bout |
| Revue | Humaine et manuelle | Adverse assistée avant la revue humaine |
| Traçabilité | Limitée | `state.json`, artefacts, verdicts horodatés |
| Lentilles | Non | 4 lentilles adverses (architecture, cold-reader, quality-gates, test-integrity) |
| Gates | Non | 46 gates réparties par phase, seuils configurables |
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

- [Le pipeline]({{ "/fr/explanation/pipeline/" | relative_url }}) — description détaillée des 5 phases
- [Les gates]({{ "/fr/reference/gates" | relative_url }}) — ce que chaque gate vérifie
- [Les lentilles]({{ "/fr/reference/lens" | relative_url }}) — les 4 lentilles de revue adverse
