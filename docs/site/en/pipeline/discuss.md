---
layout: doc
lang: en
title: "DISCUSS"
persona: software-engineer
---

# DISCUSS

The DISCUSS phase refines triaged issues into structured stories, ready for architecture.

## Mechanics

| | |
|---|---|
| **Entry trigger** | Triaged issue (output of DISCOVER) |
| **Output artefact** | Refined story with acceptance criteria (INVEST) |
| **Responsible agent** | `backlog-planner` |
| **Associated reviewer** | `backlog-planner-reviewer` |

## Why this phase exists

A poorly defined story produces code that solves the wrong problem. The backlog-planner applies INVEST criteria and the reviewer verifies that acceptance criteria are verifiable and complete.

> « In software development, there are always four variables: cost, time, quality, and scope. »
> — Beck, K., *Extreme Programming Explained, 2nd ed.*, 2004.

## What the agent produces

- User Story format with persona, action, and benefit.
- Acceptance criteria in structured natural language.
- Refined effort estimation.
- Dependency identification between stories.

## Gates crossed here

This phase crosses gates **G1–G8** (see the [gates catalogue](../catalogue/gates.html)).
Each gate is checked by the independent reviewer before moving on to **DESIGN**.
