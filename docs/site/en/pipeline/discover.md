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
- Initial effort estimation.
- Sprint proposal.

## Gates crossed here

This phase crosses gates **G1–G6** (see the [gates catalogue](../catalogue/gates.html)).
Each gate is checked by the independent reviewer before moving on to **DISCUSS**.
