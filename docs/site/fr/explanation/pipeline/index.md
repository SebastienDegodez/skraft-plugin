---
layout: doc
lang: fr
title: "Le pipeline SKRAFT"
persona: tech-lead
---

# Le pipeline SKRAFT

SKRAFT orchestre cinq phases séquentielles. Chaque phase est exécutée par un agent spécialisé et validée par un reviewer indépendant. L'orchestrateur (`skraft-orchestrator`) séquence les transitions et applique les invariants.

Le fil conducteur du pipeline, c'est le **flux d'artefacts** : la sortie de chaque phase devient l'entrée de la suivante. Les flèches ci-dessous portent l'artefact transmis.

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

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Fil rouge — Starbucks <em>(exemple illustratif)</em></span>

Pour voir ce flux en action, suivez une même demande — « commander et payer une boisson dans l'app Starbucks » — de l'idée au code, phase par phase : [Suivez un exemple de bout en bout]({{ "/fr/explanation/pipeline/fil-rouge" | relative_url }}).
</div>

## Phases

### [DISCOVER]({{ "/fr/explanation/pipeline/discover" | relative_url }})

Trier et prioriser les issues pour produire un rapport de triage actionnable.

### [DISCUSS]({{ "/fr/explanation/pipeline/discuss" | relative_url }})

Affiner les stories selon les critères INVEST et produire des critères d'acceptation vérifiables.

### [DESIGN]({{ "/fr/explanation/pipeline/design" | relative_url }})

Modéliser l'architecture via Event Modeling, DDD et Architecture Decision Records.

### [DISTILL]({{ "/fr/explanation/pipeline/distill" | relative_url }})

Traduire les décisions d'architecture en scénarios Gherkin exécutables et en plan d'implémentation.

### [DELIVER]({{ "/fr/explanation/pipeline/deliver" | relative_url }})

Implémenter le code via Outside-In TDD avec Mutation Score comme garde-fou qualité.

---

L'orchestrateur coordonne l'ensemble : il vérifie les pré-conditions de chaque phase, déclenche les reviewers, et ne permet la transition que lorsque le verdict est positif.
