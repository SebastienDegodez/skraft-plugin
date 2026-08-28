---
layout: doc
lang: fr
title: "Le pipeline SKRAFT"
persona: tech-lead
---

# Le pipeline SKRAFT

SKRAFT ne force pas une chaîne globale sur tous les projets. Il propose deux
parcours de premier niveau : le parcours principal transforme une story en code,
le parcours Brownfield aide à reprendre un système existant.

## Choisir son parcours

| Situation observée | Point d'entrée | Sortie attendue |
| --- | --- | --- |
| Une story affinée existe | `skraft-orchestrator` | PR d'ingénierie relue |
| Le backlog existe mais doit être trié ou affiné | `backlog-discoverer`, puis `backlog-planner` | story affinée pour `skraft-orchestrator` |
| Le code existe sans intention produit explicite | `brownfield-analyst` | PRD, puis issues à préparer avant `skraft-orchestrator` |
| Le legacy doit être sécurisé ou transformé | `brownfield-harness-builder`, puis `brownfield-refactorer` | code protégé ou refactoré, prêt pour les prochaines stories |

Le [parcours Brownfield]({{ "/fr/explanation/brownfield" | relative_url }}) est
un parcours frère, pas une phase préliminaire du pipeline. Ses trois racines sont
invoquées directement par l'humain et n'écrivent pas l'état de
`skraft-orchestrator`.

## Le parcours principal

Le parcours principal sépare la préparation produit du pipeline d'ingénierie.
`backlog-discoverer` puis `backlog-planner` sont deux workflows autonomes et
optionnels. Lorsqu'ils sont utilisés ensemble, leur ordre est obligatoire. Ils
livrent une story affinée à `skraft-orchestrator`, point d'entrée du pipeline
d'ingénierie.

Le fil conducteur du pipeline, c'est le **flux d'artefacts** : la sortie de chaque phase devient l'entrée de la suivante. Les flèches ci-dessous portent l'artefact transmis.

```mermaid
graph LR
    D[DISCOVER optionnel] -.->|rapport de triage| DI[DISCUSS optionnel]
    DI -.->|story INVEST| R[RESEARCH]
    R -->|recherche sourcée| DE[DESIGN]
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

## Préparation produit optionnelle

### [DISCOVER]({{ "/fr/explanation/pipeline/discover" | relative_url }})

Trier et prioriser les issues pour produire un rapport de triage actionnable.

### [DISCUSS]({{ "/fr/explanation/pipeline/discuss" | relative_url }})

Affiner les stories selon les critères INVEST et produire des critères d'acceptation vérifiables.

## Pipeline d'ingénierie orchestré

### [RESEARCH]({{ "/fr/explanation/pipeline/research" | relative_url }})

Investiguer la story et les sources pertinentes pour produire une recommandation
sourcée avant toute décision d'architecture.

### [DESIGN]({{ "/fr/explanation/pipeline/design" | relative_url }})

Modéliser l'architecture via Event Modeling, DDD et Architecture Decision Records.

### [DISTILL]({{ "/fr/explanation/pipeline/distill" | relative_url }})

Traduire les décisions d'architecture en scénarios Gherkin exécutables et en plan d'implémentation.

### [DELIVER]({{ "/fr/explanation/pipeline/deliver" | relative_url }})

Implémenter le code via Outside-In TDD avec Mutation Score comme garde-fou qualité.

---

L'orchestrateur coordonne RESEARCH → DESIGN → DISTILL → DELIVER. Il vérifie les
pré-conditions, déclenche les reviewers déclarés et applique leurs verdicts.
Lorsque le routage conclut qu'une investigation dédiée n'apporterait rien,
RESEARCH peut être sauté. Les phases exécutées restent soumises à leurs contrats
et à leurs preuves attendues.
