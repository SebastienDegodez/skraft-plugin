---
layout: doc
lang: en
title: "Why review before the review?"
description: "The core SKRAFT argument: assisted adversarial review filters before the human. Less rework, lower TTM."
---

> 🚧 GENERATED DRAFT — to be reviewed and completed by a human.

# Why review before the review?

> Human code review is valuable — and scarce. SKRAFT protects it by eliminating obvious problems before it begins.

## The problem

In a classic development cycle, human review arrives **last**. The developer delivers, the human reads. If a problem is found — incoherent architecture, missing test, vague scenario — everyone starts over. That is **rework**: work redone, time lost, TTM (Time To Market) extended.

*TTM* (Time To Market): the time between an idea and its production release. The shorter it is, the faster the organisation responds to its users.

## The SKRAFT solution

SKRAFT inserts an **assisted adversarial review** at each pipeline phase, **before** the work reaches a human:

1. An executor agent produces an artifact (BDD scenarios, architecture plan, code).
2. An independent AI reviewer, armed with specialised lenses, inspects the artifact.
3. If the verdict is REJECTED, the cycle restarts automatically — no human intervention.
4. Only when the verdict is APPROVED does the artifact move up to the human reviewer.

```
Executor → AI Reviewer → [REJECTED → retry] → APPROVED → Human
```

## What this changes in practice

| Without SKRAFT | With SKRAFT |
|----------------|-------------|
| The human finds obvious problems | The human focuses on business value |
| Frequent rework at end of cycle | Rework detected early, lower cost |
| TTM extended by back-and-forth | TTM reduced by automated filtering |
| Late feedback | Continuous feedback at each phase |

## Why "adversarial"?

The reviewer does not seek to validate — they seek to **refute**. This is the same logic as testing: a test that cannot fail proves nothing. A reviewer not trying to reject protects nothing.

The four lenses (architecture-boundaries, cold-reader, quality-gates, test-integrity) each embody a different way of refuting an artifact.

## What this does not replace

Human review remains essential. SKRAFT does not eliminate it: it **prepares** it. The human receives an artifact that has already been challenged, documented, and automatically corrected. Their review is shorter, more focused, higher value-added.

## Sources

> 🚧 To be completed by a human with appropriate references (e.g. Freeman & Pryce on fast feedback, Beck on the cost of late change).

---

*Auto-generated page — draft to be completed by a human.*
