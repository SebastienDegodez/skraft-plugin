---
layout: doc
lang: en
title: "software-engineer-reviewer"
persona: tech-lead
---

# software-engineer-reviewer

> Reviews DELIVER phase code and tests via a 4-lens adversarial review.

## When to use

- DELIVER phase (review), after the software-engineer
- Automatically dispatched by the orchestrator
- Never invoked directly by the user

## Entry contract

- Implemented code with passing tests
- Computed mutation score
- Reference ADRs and BDD scenarios

## Exit contract

- Verdict: approve or reject with justification
- On rejection, list of issues per review lens

## Invariants

- **Read-only (CQS)** — Never modifies the code it reviews
- **4 adversarial lenses** — Each lens evaluates independently, the verdict is synthesised
- **Structured verdict** — Approve or reject, no intermediate state
- See [Customisation](/en/customisation) for the full list

## Why this shape

The DELIVER reviewer is adversarial by design. Four independent lenses (architecture, tests, code, business) evaluate the deliverable without coordinating — the verdict is a weighted synthesis, not a consensus.

> « Asking a question should not change the answer. »
> — Meyer, B., *Object-Oriented Software Construction, 2nd ed.*, 1997.

The multiplicity of lenses reduces bias risk: code may pass the architectural review but fail on test coverage. Peer reviews detect defects the author can no longer see.

> « Peer reviews are the single most effective technique for finding defects. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

## Allowed customisation

- Lens weighting (L2)
- Per-lens criteria (L2)
- Verdict format (L1)
- Maximum reviewer cycles (L2)

## See also

- [software-engineer](/en/reference/agents/software-engineer) — Associated executor agent
- [software-engineer-and-reviewer](/en/reference/agents/software-engineer-and-reviewer) — Full DELIVER cycle
- [Pipeline DELIVER](/en/pipeline/deliver) — Phase description
