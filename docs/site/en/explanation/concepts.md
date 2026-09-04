---
layout: doc
lang: en
title: "Core concepts"
persona: tech-lead
---

# Core concepts

SKRAFT is built on six concepts from software engineering. Each concept is applied concretely in the pipeline — these are not theoretical ideals, but operational constraints.

## Use Case

A Use Case captures a contract between stakeholders about expected system behavior. In SKRAFT, **one refined story = one Use Case = one complete engineering cycle** (RESEARCH → DESIGN → DISTILL → DELIVER). Optional standalone DISCOVER then DISCUSS may prepare that story upstream.

> « A use case captures a contract between the stakeholders of a system about its behavior. »
> — Cockburn, A., *Writing Effective Use Cases*, 2001.

Each pipeline pass handles exactly one Use Case. No batching, no shortcuts.

## Engineering entry point

When the user selects `skraft-orchestrator` with a refined story, the orchestrator checks for a confirmed upstream planning handoff at pipeline start. DISCOVER and DISCUSS are not part of this decision: they are standalone product workflows used upstream when needed.

- **Upstream planning handoff detected** — when a complete upstream backlog-and-sprint handoff is confirmed, the phases it already satisfies are recorded in `state.json::entryPoint.skipPhases`; the pipeline advances to the first unsatisfied phase.
- **No handoff** — `skipPhases` is empty and every engineering phase runs: RESEARCH → DESIGN → DISTILL → DELIVER.

Engineering rigor is identical for every story. [`skraft-entry-point-routing`]({{ "/en/dashboard/" | relative_url }}#skill-skraft-entry-point-routing) detects the handoff; [`skraft-quality-bar`]({{ "/en/dashboard/" | relative_url }}#skill-skraft-quality-bar) keeps the same bar regardless of entry point.

## CQS — Command-Query Separation

CQS separates operations that modify state (commands) from those that read it (queries). In SKRAFT, executor agents command (they write artifacts), while reviewer agents query (they read artifacts without modifying them).

> « Asking a question should not change the answer. »
> — Meyer, B., *Object-Oriented Software Construction, 2nd ed.*, 1997.

See [Architecture]({{ "/en/explanation/architecture" | relative_url }}) for how CQS applies in the pipeline.

## CQRS — Command-Query Responsibility Segregation

CQRS extends CQS by separating read and write models. The orchestrator dispatches commands to executors (write model), then consults `state.json` as a derived read model to decide the next action.

> « Use different models for updating information and reading information. »
> — Fowler, M., *Bliki: CQRS*, 2011.

For an in-depth treatment of CQRS in a DDD context, see Vernon, *Implementing Domain-Driven Design*, 2013.

## Walking Skeleton

A Walking Skeleton is the thinnest slice that traverses all system layers end to end. SKRAFT's first iteration on a project delivers a complete vertical slice — not a prototype, a real deliverable.

> « A walking skeleton is a tiny implementation of the system that performs a small end-to-end function. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

The DELIVER pipeline implements each story as a Walking Skeleton before enriching details.

## Mutation Testing

Mutation Score measures test suite effectiveness, not just code coverage. Mutation testing injects faults into the code and verifies that tests detect them.

> « Mutation testing provides high-fidelity assessment of test suite effectiveness. »
> — Jia, Y. & Harman, M., *An Analysis and Survey of the Development of Mutation Testing*, 2011.

In the DELIVER phase, the Mutation Score serves as a quality gate: an insufficient score blocks the reviewer's PASS verdict.

## Object Calisthenics

Object Calisthenics are nine discipline rules that improve object design daily. These are not architecture rules but workshop constraints — they apply to code produced by the software-engineer.

> « Nine steps to better software design today. »
> — Bay, J., *Object Calisthenics*, 2008.

These rules govern code produced in the DELIVER phase and are verified by the software-engineer-reviewer.
