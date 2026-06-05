---
layout: doc
lang: fr
title: "Le pipeline SKRAFT"
persona: tech-lead
---

# Le pipeline SKRAFT

SKRAFT orchestre cinq phases séquentielles. Chaque phase est exécutée par un agent spécialisé et validée par un reviewer indépendant. L'orchestrateur (`skraft-orchestrator`) séquence les transitions et applique les invariants.

```mermaid
graph LR
    D[DISCOVER] --> DI[DISCUSS]
    DI --> DE[DESIGN]
    DE --> DIS[DISTILL]
    DIS --> DEL[DELIVER]
    style D fill:#1a3a2a,stroke:#4ed58a
    style DI fill:#1a3a2a,stroke:#4ed58a
    style DE fill:#1a3a2a,stroke:#4ed58a
    style DIS fill:#1a3a2a,stroke:#4ed58a
    style DEL fill:#1a3a2a,stroke:#4ed58a
```

## Phases

### [DISCOVER]({{ "/fr/pipeline/discover" | relative_url }})

Trier et prioriser les issues pour produire un rapport de triage actionnable.

### [DISCUSS]({{ "/fr/pipeline/discuss" | relative_url }})

Affiner les stories selon les critères INVEST et produire des critères d'acceptation vérifiables.

### [DESIGN]({{ "/fr/pipeline/design" | relative_url }})

Modéliser l'architecture via Event Modeling, DDD et Architecture Decision Records.

### [DISTILL]({{ "/fr/pipeline/distill" | relative_url }})

Traduire les décisions d'architecture en scénarios Gherkin exécutables et en plan d'implémentation.

### [DELIVER]({{ "/fr/pipeline/deliver" | relative_url }})

Implémenter le code via Outside-In TDD avec Mutation Score comme garde-fou qualité.

---

L'orchestrateur coordonne l'ensemble : il vérifie les pré-conditions de chaque phase, déclenche les reviewers, et ne permet la transition que lorsque le verdict est positif.
