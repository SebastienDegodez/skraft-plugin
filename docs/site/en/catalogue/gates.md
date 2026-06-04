---
layout: doc
lang: en
title: "Review gates"
description: "The gates (Gxx) crossed per phase: what each gate checks and why."
---

# Review gates

> A *gate* is an explicit, binary criterion: the reviewer declares it PASS or FAIL
> before the pipeline moves to the next phase. Nothing implicit, nothing "by feel".

## Why — the problem it solves

Without written criteria, a review depends on the reviewer's mood and memory. Gates
make the review **reproducible**: every verdict rests on a checklist known in advance,
shared by the producer and the reviewer. A failing gate blocks the transition (BLOCKER)
or flags a risk (HIGH/MEDIUM) — never a vague feeling.

## Key concepts — how it works

Each phase has its own gate grid, checked by an independent reviewer.

| Phase | Gates | What they defend |
| --- | --- | --- |
| DISCOVER | G1–G6 | The 3 discovery modes covered, no P0/P1 missed, priorities justified, sprint capacity respected, duplicates detected. |
| DISCUSS | G1–G8 | INVEST per story, no circular dependency, ≥3 unambiguous acceptance criteria, coherent milestone scope, topological DAG. |
| DESIGN | G1–G15 | Every structural choice traced by an ADR, Clean Architecture dependency rule, per-aggregate invariants, labelled context map, no "baseline" ADR. |
| DISTILL | G1–G8 | AC↔scenario bijection, edge cases represented, business vocabulary, zero technical jargon, unambiguous steps, walking skeleton coverage. |
| DELIVER | tests + mutation | RED/GREEN integrity, green build, mutation score above threshold, clean commits (see the quality-gates evidence contract). |

An unmet **BLOCKER** gate stops the phase. A **HIGH** or **MEDIUM** gate documents a
risk the reviewer records in its verdict.

## Why this practice

> « A software inspection is a rigorous review with explicit entry and exit criteria. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

Explicit entry/exit criteria are exactly what a gate materialises: the phase is only
"done" once its gates are crossed.

## Pitfalls & anti-patterns

- **Cosmetic gate**: a criterion too vague ("the code is clean") is not a gate — you
  need a verifiable binary test.
- **Complacent reviewer**: if the producer and the reviewer are the same person, the
  gate loses its power. SKRAFT mandates an *independent* reviewer.
- **Short-circuit**: some gates (e.g. DESIGN G13) short-circuit the whole review if an
  unresolved human blocker remains — do not bypass them.

## Going further

- [The adversarial review lenses](lens.html)
- [Review before review](../why-review-before-review.html)
- [The review-before-review deep dive](../deep-dive/review-before-review.html)

## Sources

- Wiegers, K. *Peer Reviews in Software*, 2002.

Terms to know: **gate**, **reviewer**, **BLOCKER**, **INVEST**, **walking skeleton**
— see the [glossary](../glossary.html).
