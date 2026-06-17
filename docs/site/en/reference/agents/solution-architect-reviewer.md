---
layout: doc
lang: en
title: "solution-architect-reviewer"
persona: tech-lead
---

# solution-architect-reviewer

> Reviews DESIGN phase artifacts and verifies architectural consistency, Clean Architecture compliance, and ADR relevance.

## When to use

- DESIGN phase (review), after the solution-architect
- Automatically dispatched by the orchestrator
- Never invoked directly by the user

## Entry contract

- ADRs, component diagrams, Event Model
- Architectural quality criteria (Clean Architecture, DDD)

## Exit contract

- Verdict: approve or reject with justification
- On rejection, list of identified architectural violations

## Invariants

- **Read-only (CQS)** — Never modifies the artifacts it reviews
- **Structured verdict** — Approve or reject, no intermediate state
- See [Customisation]({{ "/en/how-to/customisation" | relative_url }}) for the full list

## Why this shape

The architectural reviewer applies CQS: it queries artifacts without modifying them. This constraint prevents the reviewer from silently "patching" a flawed architecture — it must explicitly reject it.

> « Asking a question should not change the answer. »
> — Meyer, B., *Object-Oriented Software Construction, 2nd ed.*, 1997.

The review verifies that architectural boundaries (bounded contexts, layers) are respected, not that the code compiles.

## Allowed customisation

- Architectural review criteria (L2)
- Verdict format (L1)
- Maximum reviewer cycles (L2)

## See also

- [solution-architect]({{ "/en/reference/agents/solution-architect" | relative_url }}) — Associated executor agent
- [Pipeline DESIGN]({{ "/en/explanation/pipeline/design" | relative_url }}) — Phase description
- [Core concepts — CQS]({{ "/en/explanation/concepts" | relative_url }}) — Underlying principle
