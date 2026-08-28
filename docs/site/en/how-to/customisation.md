---
layout: doc
lang: en
title: "Customisation"
description: "What SKRAFT lets you customise and the risk of reducing controls: gates, lenses, reviewers. A guide to adapting the pipeline without breaking its guarantees."
persona: tech-lead
---

# Customisation

SKRAFT is a framework, not a straitjacket. Every component is designed to be adapted to your context — but some constraints are non-negotiable. This page distinguishes what can change from what must not.

## Customisation levels

| Level | What | Examples | Citation |
|-------|------|----------|----------|
| **L1 — Surface** | Prompt texts, vocabulary, business glossary | Rename labels, adapt story templates, translate messages | Evans (2003): ubiquitous language must reflect the domain |
| **L2 — Cycles** | Phase depth, quality thresholds, reviewer iterations | Adjust mutation score floor, change retry count, configure Walking Skeleton depth | Beck (2004): scope, time, cost, and quality are variables to manage |
| **L3 — Invariants** | Artifact structure, inter-agent contracts, CQS | Modify `state.json` format, change verdict protocol | Martin (2017): architecture protects use cases |

> « A model is a selectively simplified and consciously structured form of knowledge. »
> — Evans, E., *Domain-Driven Design*, 2003.

**Golden rule**: L1 is free, L2 is configurable with care, L3 requires deep system understanding and may break pipeline guarantees.

## Non-negotiable invariants

These constraints are non-negotiable. Each invariant is defended by an academic or industry reference.

| Invariant | Why | Reference |
|-----------|-----|-----------|
| Acceptance tests before code | BDD scenarios define expected behaviour before any implementation | Adzic, G., *Specification by Example*, 2011 |
| Mutation score floor | Line coverage is insufficient — mutation testing verifies actual test effectiveness | Jia, Y. & Harman, M., *An Analysis and Survey of the Development of Mutation Testing*, 2011 |
| Reviewer read-only (CQS) | Asking a question must not change the answer — the reviewer never modifies artifacts | Meyer, B., *Object-Oriented Software Construction, 2nd ed.*, 1997 |
| One story = one Use Case | Each pipeline pass treats exactly one Use Case, no batching | Cockburn, A., *Writing Effective Use Cases*, 2001 |
| Walking Skeleton first | The first iteration cuts through all layers end to end | Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009 |
| Outside-In TDD | Tests start from observable behaviour and descend to internal details | Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009 |
| Object Calisthenics | Design constraints applied to business code to enforce structural quality | Bay, J., *Object Calisthenics*, 2008 |

## Extending a phase

You can add a step to an existing phase — for example, inserting a `security-reviewer` between DESIGN and DISTILL. Here is how:

### 1. Create the agent

Create an `.agent.md` file by following the contracts visible in the [agentic catalogue]({{ "/en/dashboard/" | relative_url }}). Define clearly:
- Its role (executor or reviewer)
- Its entry/exit contract
- Its invariants

Author the canonical file under `plugins/skraft-framework/com.github.copilot/agents/`, then run
`npm run agents:sync`. Never edit the generated Claude `.md` mirror directly. Put path-scoped
Copilot rules under `com.github.copilot/rules/`; list a rule in `metadata.instructions` only when
the same agent must receive it through Claude's `SubagentStart` hook.

### 2. Register in the orchestrator

Add the agent in the orchestrator configuration, specifying:
- Its position in the phase sequence
- Dispatch conditions (after which agent, before which agent)
- Expected verdict format (if reviewer)

### 3. Respect CQS

If your agent is a reviewer, it **must** be read-only. If it is an executor, it **must** produce artifacts in the format expected by the next phase.

### 4. Test the chain

Run a complete pipeline cycle with your new agent to verify that:
- Artifacts flow correctly between phases
- Verdicts are correctly interpreted by the orchestrator
- Retry works on rejection

> « Good architecture makes the system easy to understand, easy to develop, easy to maintain, and easy to deploy. »
> — Martin, R. C., *Clean Architecture*, 2017.

## ⚠️ Risks of reducing controls

> **Principle**: every control removed is a blind spot that will only surface in production — where the cost of correction is highest (estimated). The decision to weaken a control should be recorded in an ADR.

### Removing or weakening a gate

Each gate protects a specific invariant (see the [detail of the 46 gates]({{ "/en/reference/gates" | relative_url }})). Removing a gate means the next phase will start without guaranteeing that the previous phase's criteria are met.

| Action | Risk | What disappears |
|--------|------|-----------------|
| Weaken the DoR in DISCUSS (G7) | Poorly-defined stories reach DESIGN | DoR (Definition of Ready) verification |
| Remove the dependency rule in DESIGN (G3) | Architecture unvalidated before tests | Detection of Clean Architecture violations |
| Lower the mutation threshold in DELIVER (G6) | Surface-only tests | Detection of tests that do not actually test |

### Disabling a review lens

The 4 lenses cover complementary angles. Disabling one of them creates a blind spot.

| Disabled lens | Blind spot |
|--------------|------------|
| `architecture-boundaries` | Architecture boundary violations reach human PR |
| `test-integrity` | Façade tests (that pass without testing) are not detected |
| `quality-gates` | Quality thresholds (mutation, coverage) are not checked |
| `cold-reader` | Code readability is not checked: the next developer will be lost |

### Putting a reviewer in write mode (violating CQS)

If a reviewer can modify artifacts, it introduces a side effect into the review. The verdict no longer reflects the original state — it reflects a state modified by the reviewer itself. This is a CQS violation that can produce non-reproducible results.

> **Rule**: never give a reviewer write access to artifacts. If you want an agent to automatically improve artifacts, create a separate *executor* agent, not a reviewer.

## See also

- [Architecture]({{ "/en/explanation/architecture" | relative_url }}) — CQS view of the pipeline
- [Core concepts]({{ "/en/explanation/concepts" | relative_url }}) — CQS, CQRS, Walking Skeleton
- [Pipeline]({{ "/en/explanation/pipeline/" | relative_url }}) — Each phase description
