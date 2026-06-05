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

## What SKRAFT requires

- **2–3 days of training** for the team on methodology and agents.
- **An identified sponsor** who drives adoption and arbitrates resistance.
- **Respect for invariants** — the pipeline guardrails are non-negotiable (see §5.3).
