---
layout: doc
lang: en
title: "Review before review — why and how"
description: "The review-before-review deep dive: assisted adversarial review by independent lenses, a verdict computed from their findings, and why it filters before the human."
---

# Review before review — why and how

> Before a human reads it, independent lenses attack the work from several angles
> and the engine computes a verdict from what they find. The human review then receives an already-filtered
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

Each reviewed phase has its own **review**: lenses that never produced the work, each in
a fresh context. In DELIVER, the engine first runs the quality gates, then starts the 3
CORE lenses. Each blocker, high or medium finding goes to `finding-refuter`, which
confirms or refutes it; the engine then computes the verdict from the findings that stand.

```text
Produced work (phase N)
        │
        ▼
┌──────────────────────────────── Review ────────────────────────────────────┐
│  Lens 1  cold-reader             ──► findings                               │
│  Lens 2  architecture-boundaries ──► findings                               │
│  Lens 3  test-integrity          ──► findings                               │
│                          │                                                  │
│                          ▼  finding-refuter checks each finding             │
│                          ▼  engine computes the verdict                     │
│            APPROVED  /  NEEDS_REWORK  /  BLOCKED                            │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
  (if APPROVED) phase transition  ──►  human review on a clean artifact
```

A single confirmed blocker, high or medium finding is enough to return the work
(`NEEDS_REWORK`); low findings are notes. A lens that cannot conclude blocks the review
(`BLOCKED`). When only one lens finds what sends the work back, the refuter judges it with
every input of the review (the Dissent Rule). Rework is bounded before human escalation.
The verdict and its findings are traced — the human review sees *why* it passed.

### Conditional lenses in DELIVER

The review is not fixed: on top of the 3 CORE lenses, **fidelity lenses** join when the
`software-engineer` has delegated test wiring to a worker. If `mock-integration-worker`
wired a mock, `mock-fidelity-lens` joins the review; if `contract-testing-worker` wired
a contract test, `contract-fidelity-lens` does. Each attacks the **fidelity** of the
wiring (does the mock/contract truly reflect the dependency?) and its findings go
through the same refuter and verdict. See the
[DELIVER fan-out]({{ "/en/explanation/pipeline/deliver" | relative_url }}) and the
[agentic catalogue]({{ "/en/dashboard/" | relative_url }}).

## Pitfalls & anti-patterns

- **Lens = producer**: the review loses its independence and falsifying power.
- **Averaging synthesis**: aggregating verdicts into an "average" instead of honouring
  each finding that stands lets the critical one slip — the engine never averages.
- **Infinite loop**: without a retry bound, an agent/lens disagreement never reaches
  the human — SKRAFT bounds and escalates.

## Sources

- Wiegers, K. *Peer Reviews in Software*, 2002.

Going further: [Review lenses]({{ "/en/dashboard/" | relative_url }}),
[Gates]({{ "/en/reference/gates" | relative_url }}),
[Review before review (principle)]({{ "/en/explanation/why-review-before-review" | relative_url }}).
