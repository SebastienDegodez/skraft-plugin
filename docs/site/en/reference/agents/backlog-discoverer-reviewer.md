---
layout: doc
lang: en
title: "backlog-discoverer-reviewer"
persona: tech-lead
---

# backlog-discoverer-reviewer

> Reviews DISCOVER phase artifacts and issues a verdict without modifying any artifact.

## When to use

- DISCOVER phase (review), after the backlog-discoverer
- Automatically dispatched by the orchestrator
- Never invoked directly by the user

## Entry contract

- Triage report produced by the backlog-discoverer
- Defined quality criteria (labels, priority, effort)

## Exit contract

- Verdict: approve or reject with justification
- On rejection, list of items to fix

## Invariants

- **Read-only (CQS)** — Never modifies the artifacts it reviews
- **Structured verdict** — Approve or reject, no intermediate state
- See [Customisation]({{ "/en/how-to/customisation" | relative_url }}) for the full list

## Why this shape

The reviewer is a read-only agent. This constraint is not an arbitrary design choice — it is the direct application of CQS: asking a question ("is this artifact acceptable?") must not change the answer.

> « Asking a question should not change the answer. »
> — Meyer, B., *Object-Oriented Software Construction, 2nd ed.*, 1997.

The strict separation between executor and reviewer prevents conflicts of interest: the producer does not judge, the judge does not produce.

## Allowed customisation

- Review criteria and acceptance thresholds (L2)
- Verdict format (L1)
- Maximum reviewer cycles (L2)

## See also

- [backlog-discoverer]({{ "/en/reference/agents/backlog-discoverer" | relative_url }}) — Associated executor agent
- [Pipeline DISCOVER]({{ "/en/explanation/pipeline/discover" | relative_url }}) — Phase description
- [Core concepts — CQS]({{ "/en/explanation/concepts" | relative_url }}) — Underlying principle
