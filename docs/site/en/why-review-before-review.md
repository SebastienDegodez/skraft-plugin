---
layout: doc
lang: en
title: "Why a review before the review?"
description: "SKRAFT's core argument: AI-assisted adversarial review filters defects before a human intervenes, reducing rework and Time-to-Market."
---

> 🚧 GENERATED DRAFT — to be reviewed and completed by a human.

# Why a review before the review?

> Imagine a judge who must settle a dispute: you prefer your lawyers to have exchanged arguments in writing *before* the hearing, rather than discovering flaws in the courtroom. SKRAFT applies this principle to code review.

## The problem: human review absorbs too much noise

In a classic workflow, a Pull Request reaches the human reviewer carrying:
- automatically-detectable architecture errors,
- untested edge cases that the spec should have specified,
- variable names that obscure intent.

The human reviewer spends time flagging these mechanical problems instead of focusing on real design questions.

**Result**: long revision cycles, costly rework, degraded Time-to-Market (TTM).

> **Jargon** — *TTM (Time-to-Market)*: the delay between defining a feature and its availability in production. *Rework*: work to be redone because it failed review.

## The SKRAFT solution: filter before the human

SKRAFT inserts an **AI-assisted adversarial review** *before* code reaches a human. This review is conducted by specialised agents called *reviewers*, which play a devil's advocate role:

1. Each reviewer applies a different **lens** (architecture, readability, quality gates, test integrity).
2. If the verdict is `REJECT`, the executor agent must correct and resubmit — without involving a human.
3. Only when all verdicts are `APPROVE` (or `CONDITIONAL_APPROVE`) does the Pull Request move to human review.

```
[Produced code] → [AI reviewer × 4 lenses] → [Corrections if REJECT] → [Human PR]
```

> **Jargon** — *lens*: a specific viewpoint applied to the review (e.g. "are architecture boundaries respected?"). *Gate*: quality threshold that must be crossed to proceed to the next phase.

## What changes in practice

| Before (without SKRAFT) | With SKRAFT |
|-------------------------|-------------|
| PR arrives with automatically-detectable issues | Mechanical issues are filtered before human PR |
| Human reviewer flags basic errors | Human reviewer focuses on design and business intent |
| Multiple revision cycles per story | Fewer cycles, less rework |

## What stays the same

SKRAFT does not replace human judgment. It filters noise so the human reviewer can focus on what really matters: business relevance, non-obvious design choices, user experience.

<!-- 🚧 To complete: additional qualitative arguments to be added by a human,
     particularly observations drawn from real projects (no invented metrics). -->

## Sources

<!-- 🚧 To complete: add citations from citations.yml. -->

## See also

- [For decision-makers](/en/for-executives) — TTM projection for executives
- [Lenses](/en/catalogue/lens) — the 4 adversarial review lenses
- [The pipeline](/en/pipeline/) — the 5 lifecycle phases
