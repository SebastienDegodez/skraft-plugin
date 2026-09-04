---
layout: doc
lang: en
title: "DISCOVER"
persona: software-engineer
---

# DISCOVER

{% include phase-ribbon.html current="discover" %}

The DISCOVER phase transforms a raw stream of issues into a prioritised, actionable triage report.

## What enters, what exits

| | |
|---|---|
| **Comes from** | — (pipeline entry): a raw stream of issues |
| **What enters** | Raw issue or milestone to process |
| **What exits** | Prioritised triage report (priority, labels, effort) |
| **Goes to** | **DISCUSS** — which refines the selected issues into stories |
| **Responsible agent** | `backlog-discoverer` |
| **Associated reviewer** | `backlog-discoverer-reviewer` |

## Why this phase exists

Without systematic triage, teams work on whatever is loudest, not whatever is most valuable. The reviewer verifies that prioritisation is coherent and no duplicates were missed.

> « Peer reviews are the single most effective quality practice a software organization can employ. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Running example — Starbucks <em>(illustrative)</em></span>

The idea “enable mobile ordering in the app” enters here as a **raw issue**. DISCOVER prioritises it **P1**, detects it overlaps an existing “in-app payment” request, and emits it in a **triage report**. That report is what DISCUSS receives.
</div>

## What the agent produces

- MoSCoW priority classification.
- Duplicate and related-issue detection.
- Initial effort estimation, in Fibonacci points (1, 2, 3, 5, 8).
- Sprint proposal.

Points are not days. A point measures relative complexity, not duration. SKRAFT converts
them into team-days for one reason only: capacity arrives in days, and the two units
cannot be compared without a bridge. The conversion is a local convention of this
repository — never a measurement, never a forecast, never a date.

| Points | Team-days |
|---|---|
| 1 | 0.25 |
| 2 | 0.5 |
| 3 | 0.75 |
| 5 | 1.5 |
| 8 | 3 |
| 13 and 21 | must be split before the sprint |

Cost per point never falls as the card grows. Splitting an 8-point card into 3 + 5 costs
2.25 days instead of 3: splitting is the cheaper arithmetic, never the more expensive one.

## Gates crossed here

This phase crosses gates **G1–G6** (see the [gates catalogue]({{ "/en/reference/gates" | relative_url }})).
Each gate is checked by the independent reviewer before moving on to **DISCUSS**.
