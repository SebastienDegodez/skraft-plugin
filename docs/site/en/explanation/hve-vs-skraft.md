---
layout: doc
lang: en
title: "HVE → SKRAFT: continuity and rupture"
description: "How SKRAFT extends HVE by replacing the RPI workflow with a full SDLC pipeline: 5 phases, independent reviewers, gates, and lenses."
---

# HVE → SKRAFT: continuity and rupture

> SKRAFT does not replace HVE — it extends it. Where HVE instruments the conversation between a human and an AI, SKRAFT structures the entire lifecycle of a User Story, from discovery to delivery.

## Why the transition?

HVE (Hypervelocity Engineering) provides an RPI (*Research → Plan → Implement*) workflow that works well for solo developers working with an AI assistant. This workflow assumes quality review remains human and manual.

SKRAFT takes over when you want to:
- **automate adversarial review** before a human intervenes,
- **trace every decision** (artifacts, `state.json`, verdicts),
- **scale** across a team or a full backlog.

## The SKRAFT pipeline in 5 phases

```mermaid
graph LR
    D[DISCOVER] -->|triage report| DI[DISCUSS]
    DI -->|INVEST story| DE[DESIGN]
    DE -->|ADR + event model| DIS[DISTILL]
    DIS -->|Gherkin scenarios| DEL[DELIVER]
    DEL -->|code + evidence| PR[Pull Request]
    style D fill:#1a3a2a,stroke:#4ed58a
    style DI fill:#1a3a2a,stroke:#4ed58a
    style DE fill:#1a3a2a,stroke:#4ed58a
    style DIS fill:#1a3a2a,stroke:#4ed58a
    style DEL fill:#1a3a2a,stroke:#4ed58a
    style PR fill:#102016,stroke:#6f8478
```

| Phase | Executor agent | Independent reviewer | Gates crossed |
|-------|---------------|----------------------|---------------|
| DISCOVER | `backlog-discoverer` | `backlog-discoverer-reviewer` | G1–G6 |
| DISCUSS | `backlog-planner` | `backlog-planner-reviewer` | G1–G8 |
| DESIGN | `solution-architect` | `solution-architect-reviewer` | G1–G15 |
| DISTILL | `acceptance-designer` | `acceptance-designer-reviewer` | G1–G8 |
| DELIVER | `software-engineer` | `software-engineer-reviewer` | delivery gates |

> **Jargon**: a *gate* is a quality checkpoint that blocks progression if quality thresholds are not met. A *reviewer* is a read-only agent that emits a verdict without modifying artifacts (CQS principle). The [detail of the 46 gates]({{ "/en/reference/gates" | relative_url }}) is in the catalogue.

## HVE vs SKRAFT: comparison table

| Dimension | HVE (RPI) | SKRAFT (5 phases) |
|-----------|-----------|-------------------|
| Scope | One development session | One User Story end to end |
| Review | Human and manual | Adversarial assisted before human review |
| Traceability | Limited | `state.json`, artifacts, timestamped verdicts |
| Lenses | None | 4 adversarial lenses (architecture, cold-reader, quality-gates, test-integrity) |
| Gates | None | 46 gates spread per phase, configurable thresholds |
| Scalability | Solo / pair | Team, full backlog |

## What stays the same

SKRAFT **inherits** the principles of HVE:
- The developer remains in control of decisions.
- AI assists; it does not decide.
- Quality is non-negotiable.

## Sources

> « Peer reviews are the single most effective quality practice a software organization can employ. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

## See also

- [The pipeline]({{ "/en/explanation/pipeline/" | relative_url }}) — detailed description of the 5 phases
- [Gates]({{ "/en/reference/gates" | relative_url }}) — what each gate checks
- [Lenses]({{ "/en/reference/lens" | relative_url }}) — the 4 adversarial review lenses
