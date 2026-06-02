---
layout: default
lang: en
title: "backlog-planner-reviewer"
persona: tech-lead
---

# backlog-planner-reviewer

> Reviews DISCUSS phase artifacts and verifies INVEST quality of refined stories.

## When to use

- DISCUSS phase (review), after the backlog-planner
- Automatically dispatched by the orchestrator
- Never invoked directly by the user

## Entry contract

- Refined story with acceptance criteria
- INVEST quality criteria and DoR gate

## Exit contract

- Verdict: approve or reject with justification
- On rejection, list of unmet INVEST criteria

## Invariants

- **Read-only (CQS)** — Never modifies the artifacts it reviews
- **Structured verdict** — Approve or reject, no intermediate state
- See [Customisation](/en/customisation) for the full list

## Why this shape

The reviewer is strictly read-only. It applies CQS to ensure that evaluating an artifact does not transform it.

> « Asking a question should not change the answer. »
> — Meyer, B., *Object-Oriented Software Construction, 2nd ed.*, 1997.

This separation forces the planner to produce complete stories on the first pass, rather than relying on a reviewer to "fix" the gaps.

## Allowed customisation

- INVEST criteria weighting (L2)
- Verdict format (L1)
- Maximum reviewer cycles (L2)

## See also

- [backlog-planner](/en/reference/agents/backlog-planner) — Associated executor agent
- [Pipeline DISCUSS](/en/pipeline/discuss) — Phase description
- [Core concepts — CQS](/en/concepts) — Underlying principle
