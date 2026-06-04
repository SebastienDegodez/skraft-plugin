---
layout: doc
lang: en
title: "DISCOVER"
persona: software-engineer
---

# DISCOVER

The DISCOVER phase transforms a raw stream of issues into a prioritised, actionable triage report.

## Mechanics

| | |
|---|---|
| **Entry trigger** | New issue or milestone to process |
| **Output artefact** | Triage report (priority, labels, effort estimate) |
| **Responsible agent** | `backlog-discoverer` |
| **Associated reviewer** | `backlog-discoverer-reviewer` |

## Why this phase exists

Without systematic triage, teams work on whatever is loudest, not whatever is most valuable. The reviewer verifies that prioritisation is coherent and no duplicates were missed.

> « Peer reviews are the single most effective quality practice a software organization can employ. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

## What the agent produces

- MoSCoW priority classification.
- Duplicate and related-issue detection.
- Initial effort estimation.
- Sprint proposal.

## Gates crossed here

This phase crosses gates **G1–G6** (see the [gates catalogue](../catalogue/gates.html)).
Each gate is checked by the independent reviewer before moving on to **DISCUSS**.
