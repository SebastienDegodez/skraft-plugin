---
layout: doc
lang: en
title: "For executives"
description: "Why AI-assisted adversarial review reduces TTM. Qualitative arguments for decision-makers: enforceable discipline, empirical metrics, speed without hidden debt."
persona: manager
---

# For executives

## Situation

Teams ship with LLMs. The speed is there — developers produce code faster than ever.

## Complication

Without imposed discipline, AI produces plausible but unverified code. Test coverage is declarative, reviews are superficial, and technical debt accumulates silently.

> « The only way to go fast is to go well. »
> — Martin, R. C., *Clean Architecture*, 2017.

## Question

How do you frame AI so that delivery speed translates to delivered value?

## Answer — The 3 SKRAFT levers

### 1. Enforceable discipline

Each pipeline phase applies the CQS principle: the executor agent writes, the reviewer verifies. No agent validates its own work. Invariants are checked automatically before every phase transition.

### 2. Empirical quality metrics

SKRAFT measures Mutation Score, not declarative coverage. A test that detects no mutation is a test that protects nothing.

> « Software delivery performance predicts organizational performance and profitability. »
> — Forsgren, N., Humble, J. & Kim, G., *Accelerate*, 2018.

### 3. Speed without hidden debt

The Walking Skeleton validates end-to-end architecture before writing any business logic. Outside-In TDD ensures every line of code is guided by an acceptance test.

> « High performers spend less time on unplanned work and rework, freeing capacity for new value. »
> — Forsgren, N., Humble, J. & Kim, G., *Accelerate*, 2018.

## Measurable ROI — DORA metrics

| Metric | Without pipeline | With SKRAFT |
|---|---|---|
| Change Failure Rate | High — bugs found in production | Reduced — validated by Mutation Score before merge |
| MTTR | Slow — manual diagnosis | Fast — traceability from issue → test → code |
| Deployment Frequency | Slowed by fear of breaking things | Accelerated — every commit is verified |

> « If you only quantify one thing, quantify the cost of delay. »
> — Reinertsen, D. G., *The Principles of Product Development Flow*, 2009.

## Current limits and roadmap

The DORA metrics table above is a qualitative projection — not a benchmark measured on
SKRAFT itself. The causal chain is grounded in established literature (Forsgren et al.,
Wiegers), but no controlled study has yet measured SKRAFT's impact on a production team.
Treat those figures as direction, not guarantee.

### Active guardrails (G1, G4, G5, G7, G8)

Five guardrails are operational today. They enforce dispatch order, artifact structure,
reviewer verdicts, and direct state-file writes at the runtime level — *before* the tool
executes. These are mechanical, not advisory.

### Planned guardrails (G2, G3) and infrastructure (US6, US13)

Two guardrails are not yet active:

- **G2 (skill injection)** and **G3 (skill audit)** — a sub-agent currently starts
  without a guaranteed skill set. The expected constraints may not be injected, which
  is a real blind spot for hallucination of method.
- **Boundary-to-boundary tests (US6)** — guardrails are unit-tested but not tested
  end-to-end; a silent regression remains possible.
- **Recovery/rollback (US13)** — if state is corrupted, the pipeline may stall with
  no clean exit path.

### Next measurable ROI lever

The largest unactivated cost lever is the **out-of-LLM verdict schema**: today the model
formats reviewer verdicts, which represents a non-trivial token tax on reviewer output.
When implemented, this lever will produce a quantifiable reduction in reviewer spend.

## What SKRAFT requires

- **2–3 days of training** for the team on methodology and agents.
- **An identified sponsor** who drives adoption and arbitrates resistance.
- **Respect for invariants** — the pipeline guardrails are non-negotiable (see §5.3).
