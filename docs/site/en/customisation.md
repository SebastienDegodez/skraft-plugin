---
layout: doc
lang: en
title: "Customisation"
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

Create an `.agent.md` file for your new agent using the [create-custom-agent](/en/reference/skills/create-custom-agent) skill. Define clearly:
- Its role (executor or reviewer)
- Its entry/exit contract
- Its invariants

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

## ⚠️ Risks of customisation — what you may lose

> 🚧 GENERATED DRAFT — this section must be reviewed and completed by a human.

Every customisation **potentially reduces pipeline controls**. Before changing anything, ask yourself: *which control am I weakening?*

| Customisation | Risk | Control weakened |
|--------------|------|-----------------|
| Remove a reviewer | No more independent verification | Executor/verifier separation |
| Lower the mutation score floor | Insufficient tests go unnoticed | Actual test effectiveness |
| Bypass a gate (Gxx) | Incomplete artifacts advance in the pipeline | Per-phase quality |
| Modify `state.json` without a protocol | Loss of traceability, incoherent artifacts | Pipeline auditability |
| Disable an adversarial lens | A review angle disappears (e.g. architecture or test integrity) | Adversarial review coverage |
| Mix command and query (CQS) | A reviewer can modify state — results are no longer reproducible | Review reproducibility |

> **Caution rule**: before any L2 or L3 customisation, document in an ADR (Architecture Decision Record) the control you accept to reduce and why.

## See also

- [Architecture](/en/architecture) — CQS view of the pipeline
- [Core concepts](/en/concepts) — CQS, CQRS, Walking Skeleton
- [Pipeline](/en/pipeline/) — Each phase description
