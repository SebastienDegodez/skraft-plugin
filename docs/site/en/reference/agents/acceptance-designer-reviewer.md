---
layout: doc
lang: en
title: "acceptance-designer-reviewer"
persona: tech-lead
---

# acceptance-designer-reviewer

> Reviews BDD scenarios and the implementation plan from the DISTILL phase, verifying business coverage and testability.

## When to use

- DISTILL phase (review), after the acceptance-designer
- Automatically dispatched by the orchestrator
- Never invoked directly by the user

## Entry contract

- `.feature` files (Gherkin scenarios)
- Implementation plan
- Original story acceptance criteria

## Exit contract

- Verdict: approve or reject with justification
- On rejection, list of missing or poorly formed scenarios

## Invariants

- **Read-only (CQS)** — Never modifies the artifacts it reviews
- **Structured verdict** — Approve or reject, no intermediate state
- See [Customisation]({{ "/en/how-to/customisation" | relative_url }}) for the full list

## Why this shape

The DISTILL reviewer verifies that scenarios cover acceptance criteria without modifying the `.feature` files. CQS applies: reading a scenario to evaluate it must not transform it.

> « Asking a question should not change the answer. »
> — Meyer, B., *Object-Oriented Software Construction, 2nd ed.*, 1997.

The review focuses on business coverage (are all cases covered?) and Gherkin quality (are the scenarios understandable by a domain expert?).

## Allowed customisation

- Minimum coverage criteria (L2)
- Verdict format (L1)
- Maximum reviewer cycles (L2)

## See also

- [acceptance-designer]({{ "/en/reference/agents/acceptance-designer" | relative_url }}) — Associated executor agent
- [Pipeline DISTILL]({{ "/en/explanation/pipeline/distill" | relative_url }}) — Phase description
- [Core concepts — CQS]({{ "/en/explanation/concepts" | relative_url }}) — Underlying principle
