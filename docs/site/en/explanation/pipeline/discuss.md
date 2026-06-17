---
layout: doc
lang: en
title: "DISCUSS"
persona: software-engineer
---

# DISCUSS

{% include phase-ribbon.html current="discuss" %}

The DISCUSS phase refines triaged issues into structured stories, ready for architecture.

## What enters, what exits

| | |
|---|---|
| **Comes from** | **DISCOVER** — the prioritised triage report |
| **What enters** | Triaged issue to refine |
| **What exits** | INVEST story + verifiable acceptance criteria |
| **Goes to** | **DESIGN** — which designs its architecture |
| **Responsible agent** | `backlog-planner` |
| **Associated reviewer** | `backlog-planner-reviewer` |

## Why this phase exists

A poorly defined story produces code that solves the wrong problem. The backlog-planner applies INVEST criteria and the reviewer verifies that acceptance criteria are verifiable and complete.

> « In software development, there are always four variables: cost, time, quality, and scope. »
> — Beck, K., *Extreme Programming Explained, 2nd ed.*, 2004.

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Running example — Starbucks <em>(illustrative)</em></span>

The triage report enters. DISCUSS derives the **INVEST story**: “As a customer, I order a customised drink to pick up in store.” It exits with **3 acceptance criteria** (choose size, choose milk, pay before preparation). DESIGN will receive this story.
</div>

## What the agent produces

- User Story format with persona, action, and benefit.
- Acceptance criteria in structured natural language.
- Refined effort estimation.
- Dependency identification between stories.

## Gates crossed here

This phase crosses gates **G1–G8** (see the [gates catalogue]({{ "/en/reference/gates" | relative_url }})).
Each gate is checked by the independent reviewer before moving on to **DESIGN**.
