---
layout: default
lang: en
title: "DISTILL"
persona: software-engineer
---

# DISTILL

The DISTILL phase transforms architecture decisions into executable specifications.

## Mechanics

| | |
|---|---|
| **Entry trigger** | Architecture decisions (output of DESIGN) |
| **Output artefact** | Gherkin scenarios + implementation plan |
| **Responsible agent** | `acceptance-designer` |
| **Associated reviewer** | `acceptance-designer-reviewer` |

## Why this phase exists

Gherkin scenarios serve as a contract between business and code. The acceptance-designer writes Given-When-Then scenarios that capture expected behaviour. The reviewer verifies that every acceptance criterion is covered and that scenarios are testable.

> « Specification by Example bridges the communication gap between business and technology. »
> — Adzic, G., *Specification by Example*, 2011.

## What the agent produces

- `.feature` files in Gherkin format with Given-When-Then.
- Coverage matrix linking each acceptance criterion to a scenario.
- Implementation plan ordering tests by layer (Domain, Application, Infrastructure, API).
- Identification of Test Doubles needed at each boundary.
