---
layout: doc
lang: en
title: "Review before review — why and how"
description: "The review-before-review deep dive: assisted 4-lens adversarial review, weighted synthesis, and why it filters before the human."
---

# Review before review — why and how

> Before a human reads it, an independent reviewer attacks the work from several
> angles and issues a verdict. The human review then receives an already-filtered
> artifact — not a draft.

## The problem (concrete context)

When the first read of a change is done by a human, it spends the team's most expensive
time on defects a systematic check could have caught: a test that asserts nothing, a
dependency violating a boundary, a forgotten acceptance criterion. The reviewer tires
on the trivial and misses the subtle. The cycle stretches with every round-trip.

The *review-before-review* idea: insert an **assisted adversarial** review between
production and human review. It does not replace the human — it hands them work already
cleared of detectable defects.

## What the sources say

Wiegers grounds every review in explicit criteria and in the effect of multiple eyes.

> « Peer reviews are the single most effective quality practice a software organization can employ. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

And on the value of multiple, independent eyes:

> « The combined attention of several reviewers finds defects a single reader misses. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

## Application in SKRAFT

Each phase has an **independent reviewer** (never the producer). In DELIVER, this
reviewer applies **4 independent lenses** then a **weighted synthesis** (Genesis A7
pattern).

```text
Produced work (phase N)
        │
        ▼
┌──────────────────────────── Independent reviewer ──────────────────────────┐
│  Lens 1  cold-reader             ──► verdict + findings                     │
│  Lens 2  architecture-boundaries ──► verdict + findings                     │
│  Lens 3  test-integrity          ──► verdict + findings                     │
│  Lens 4  quality-gates           ──► verdict + findings                     │
│                          │                                                  │
│                          ▼  weighted synthesis                              │
│            APPROVED  /  CHANGES_REQUESTED  /  REJECTED                       │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
  (if APPROVED) phase transition  ──►  human review on a clean artifact
```

A single BLOCKER on one lens is enough to return the work (`CHANGES_REQUESTED`), with a
bounded number of retries before human escalation. The verdict and its findings are
traced — the human review sees *why* it passed.

### Conditional lenses in DELIVER

The panel is not fixed: on top of the 4 CORE lenses, **fidelity lenses** join when the
`software-engineer` has delegated test wiring to a worker. If `mock-integration-worker`
wired a mock, `mock-fidelity-lens` joins the panel; if `contract-testing-worker` wired
a contract test, `contract-fidelity-lens` does. Each attacks the **fidelity** of the
wiring (does the mock/contract truly reflect the dependency?) and honours the same
BLOCKER rule. See the
[DELIVER fan-out]({{ "/en/explanation/pipeline/deliver" | relative_url }}) and the
[agentic catalogue]({{ "/en/dashboard/" | relative_url }}).

## Pitfalls & anti-patterns

- **Reviewer = producer**: the review loses its independence and falsifying power.
- **Averaging synthesis**: aggregating verdicts into an "average" instead of honouring
  BLOCKERs lets the critical one slip.
- **Infinite loop**: without a retry bound, an agent/reviewer disagreement never reaches
  the human — SKRAFT bounds and escalates.

## Sources

- Wiegers, K. *Peer Reviews in Software*, 2002.

Going further: [Review lenses]({{ "/en/dashboard/" | relative_url }}),
[Gates]({{ "/en/reference/gates" | relative_url }}),
[Review before review (principle)]({{ "/en/explanation/why-review-before-review" | relative_url }}).
