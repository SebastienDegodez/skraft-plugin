---
layout: doc
lang: fr
title: "SKRAFT — Le Handbook"
description: "Page d'accueil du handbook SKRAFT : pitch, promesse, et routage Diátaxis par rôle (décideur, développeur, architecte, nouveau venu de HVE)."
persona: tech-lead
---

# SKRAFT — Le Handbook

SKRAFT est un **pipeline SDLC piloté par des agents IA**. Chaque phase de
développement est exécutée par un agent dédié, puis validée par un reviewer
indépendant — aucun agent ne valide son propre travail.

> « The only way to go fast is to go well. »
> — Martin, R. C., *Clean Architecture*, 2017.

## Première visite ? Suivez le fil rouge

La façon la plus rapide de comprendre SKRAFT, c'est de suivre **un seul exemple**
de l'idée au code livré :

➡️ **[Le fil rouge : une commande Starbucks de bout en bout]({{ "/fr/explanation/pipeline/fil-rouge" | relative_url }})**

Puis installez le plugin et lancez le pipeline : [Premiers pas]({{ "/fr/tutorials/getting-started" | relative_url }}).

## Comment lire ce handbook

La documentation suit la structure **Diátaxis** — quatre portes selon ce que vous
cherchez à faire :

| Porte | Pour… | Commencez par |
| --- | --- | --- |
| **Apprendre** | suivre un parcours guidé | [Le fil rouge]({{ "/fr/explanation/pipeline/fil-rouge" | relative_url }}), [Premiers pas]({{ "/fr/tutorials/getting-started" | relative_url }}) |
| **Comprendre** | savoir *pourquoi* c'est construit ainsi | [Le pipeline]({{ "/fr/explanation/pipeline/" | relative_url }}), [La revue avant la revue]({{ "/fr/explanation/pourquoi-review-avant-review" | relative_url }}) |
| **Consulter** | retrouver un fait précis | [Agents]({{ "/fr/reference/agents/" | relative_url }}), [Gates]({{ "/fr/reference/gates" | relative_url }}), [Patterns]({{ "/fr/reference/patterns" | relative_url }}) |
| **Approfondir** | creuser une approche | [Outside-In TDD]({{ "/fr/explanation/deep-dive/outside-in-tdd" | relative_url }}), [Walking Skeleton]({{ "/fr/explanation/deep-dive/walking-skeleton" | relative_url }}) |

## Où aller selon votre rôle

- **Décideur** — pourquoi la revue assistée réduit le délai de livraison : [Pour décideurs]({{ "/fr/explanation/for-executives" | relative_url }}).
- **Développeur** — le pipeline phase par phase et l'équipe d'agents : [Le pipeline]({{ "/fr/explanation/pipeline/" | relative_url }}), [L'équipe]({{ "/fr/explanation/pipeline/team" | relative_url }}).
- **Architecte** — décisions et frontières : [Architecture]({{ "/fr/explanation/architecture" | relative_url }}), [Clean Architecture]({{ "/fr/explanation/clean-architecture" | relative_url }}).
- **Vous venez de HVE ?** — la continuité (RPI, `state.json`, BRD/PRD en amont) : [HVE → SKRAFT]({{ "/fr/explanation/hve-vs-skraft" | relative_url }}).

## Le pipeline en une image

```mermaid
graph LR
    D[DISCOVER] -->|triage| DI[DISCUSS]
    DI -->|story| DE[DESIGN]
    DE -->|architecture| DIS[DISTILL]
    DIS -->|scénarios| DEL[DELIVER]
    DEL -->|code| PR[Pull Request]
    style D fill:#1a3a2a,stroke:#4ed58a
    style DI fill:#1a3a2a,stroke:#4ed58a
    style DE fill:#1a3a2a,stroke:#4ed58a
    style DIS fill:#1a3a2a,stroke:#4ed58a
    style DEL fill:#1a3a2a,stroke:#4ed58a
    style PR fill:#102016,stroke:#6f8478
```

Cinq phases, un agent et un reviewer par phase, sur le substrat partagé
[HVE-Core]({{ "/fr/explanation/hve-core" | relative_url }}).
