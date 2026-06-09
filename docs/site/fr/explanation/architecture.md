---
layout: doc
lang: fr
title: "Architecture"
persona: tech-lead
---

# Architecture

SKRAFT applique le principe CQS (Command-Query Separation) au niveau système. L'orchestrateur dispatche des commandes vers des agents exécuteurs, qui produisent des artefacts. Les agents reviewers lisent ces artefacts et émettent des verdicts — ils ne modifient jamais rien.

> « Asking a question should not change the answer. »
> — Meyer, B., *Object-Oriented Software Construction, 2nd ed.*, 1997.

## Vue d'ensemble

```mermaid
graph TB
    O[skraft-orchestrator] -->|dispatch| BD[backlog-discoverer]
    O -->|dispatch| BP[backlog-planner]
    O -->|dispatch| SA[solution-architect]
    O -->|dispatch| AD[acceptance-designer]
    O -->|dispatch| SE[software-engineer]
    
    BD -->|writes| A1[triage report]
    BP -->|writes| A2[refined stories]
    SA -->|writes| A3[ADRs + diagrams]
    AD -->|writes| A4[Gherkin scenarios]
    SE -->|writes| A5[tested code]

    SE -.fan-out.-> MIW[mock-integration-worker]
    SE -.fan-out.-> CTW[contract-testing-worker]
    MIW -->|test wiring| A5
    CTW -->|test wiring| A5
    MIW -.si actif.-> MFL[mock-fidelity-lens]
    CTW -.si actif.-> CFL[contract-fidelity-lens]
    MFL -->|verdict| SER
    CFL -->|verdict| SER
    
    A1 -.->|reads| BDR[backlog-discoverer-reviewer]
    A2 -.->|reads| BPR[backlog-planner-reviewer]
    A3 -.->|reads| SAR[solution-architect-reviewer]
    A4 -.->|reads| ADR[acceptance-designer-reviewer]
    A5 -.->|reads| SER[software-engineer-reviewer]
    
    BDR -->|verdict| O
    BPR -->|verdict| O
    SAR -->|verdict| O
    ADR -->|verdict| O
    SER -->|verdict| O
    
    O -.->|reads| S[(state.json)]
    
    style O fill:#2d5a3d,stroke:#4ed58a,stroke-width:2px
    style S fill:#1a2a3a,stroke:#7fd3ff
    style MIW fill:#243a2e,stroke:#4ed58a
    style CTW fill:#243a2e,stroke:#4ed58a
    style MFL fill:#3a2e1a,stroke:#d5a84e
    style CFL fill:#3a2e1a,stroke:#d5a84e
```

## Légende

| Flèche | Signification |
|--------|---------------|
| **Trait plein** orchestrateur → exécuteur | Commande (côté command de CQS) |
| **Trait plein** exécuteur → artefact | Écriture — l'exécuteur produit un artefact |
| **Trait pointillé** artefact → reviewer | Lecture seule (côté query de CQS) |
| **Trait plein** reviewer → orchestrateur | Verdict (PASS / FAIL + motifs) |
| **Trait pointillé** orchestrateur → state.json | Modèle de lecture CQRS |
| **Trait pointillé** `software-engineer` → worker | Fan-out interne DELIVER (sous-agents `user-invocable: false`) |
| **Trait pointillé** worker → lentille de fidélité | La lentille rejoint le panel quand la capacité est active |

## Le fan-out interne de DELIVER

En DELIVER, le `software-engineer` ne câble pas les tests à la main : il **délègue**
le wiring à des sous-agents internes (`mock-integration-worker` pour le mocking du
dépendant, `contract-testing-worker` pour le test de contrat fournisseur). Chaque
worker n'émet que du câblage de test ; le cycle TDD métier reste chez le lead, qui
vérifie le worker en TIER-1 (RED → GREEN). Quand une capacité est active, sa
**lentille de fidélité** (`mock-fidelity-lens` / `contract-fidelity-lens`) rejoint le
panel adverse du `software-engineer-reviewer`. Voir la
[référence des agents]({{ "/fr/reference/agents/" | relative_url }}).

## Séparation stricte

Les exécuteurs **écrivent** des artefacts mais n'émettent jamais de verdict sur leur propre travail. Les reviewers **lisent** les artefacts et produisent un verdict, mais ne modifient jamais le code ni les documents. Cette séparation garantit que chaque artefact est validé par un regard indépendant.

Le fichier `state.json` sert de modèle de lecture (CQRS) : l'orchestrateur y enregistre la progression des phases et les verdicts, puis le consulte pour décider de la prochaine action.

Voir [Concepts fondamentaux]({{ "/fr/explanation/concepts" | relative_url }}) pour la théorie derrière CQS et CQRS.
