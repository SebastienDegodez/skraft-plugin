---
layout: doc
lang: en
title: "test-design-mandates"
description: "Use when designing test coverage matrices, assigning tests to Clean Architecture layers, planning the outside-in impl..."
persona: tech-lead
---

# test-design-mandates

> Five mandatory rules governing test design in a Clean Architecture context — loaded after Gherkin scenarios are written, before any implementation starts.

## When to use

- After Gherkin scenarios have been validated (DISTILL exit)
- To design the coverage matrix before implementation
- To decide whether a domain unit test is authorised (Mandate 4)
- To plan the outside-in implementation order and the Walking Skeleton

## Entry contract

- User-approved Gherkin scenarios
- Identified Clean Architecture (Domain / Application / Infrastructure / API)
- The permanent quality bar (`skraft-quality-bar` skill) — the same bar on every story; there is no strictness setting to read

## Exit contract

- Per-story coverage matrix with columns: Scenario, Use Case Boundary, Layer, Extraction Reason, Double Type, Walking Skeleton, Priority
- Every Domain row carrying a valid `Extraction Reason` code (`branch_unreachable_via_AC` or `combinatorial_economy`), or removed
- Implementation order P1 (Walking Skeleton) → P2 (business rules) → P3 (infrastructure)

## Invariants

- **M1 — Use case boundary** — every Application test enters through the use case; never direct instantiation of an internal domain class
- **M2 — Business language abstraction** — three strict layers: Gherkin (pure business) / Step methods (bridge) / Business services (technical); no technical vocabulary leaks upward into Gherkin
- **M3 — User journey completeness** — every scenario includes Setup (Given) + Action (When, one only) + Observable Outcome (Then)
- **M4 — Domain extraction forbidden by default** — no domain unit test unless gate (a) branch unreachable via AC or gate (b) combinatorial economy opens
- **M5 — Visual/positional AC enforcement** — an AC in visual/positional/style terms (`@visual` tag) is closed only by a Playwright E2E test with a real measurement; a jsdom/unit test alone is not a valid closure
- **TBU forbidden** — no production code unwired through the composition root; acceptance tests validate real wiring
- **No reduced mode** — the five mandates apply to every story; nothing relaxes them, and no rationale buys an exemption

## Why this shape

Tests enter through a use case boundary and assert at the next visible boundary. This rule prevents TBU (Tested But Unwired) defects — code that works in isolation but is never called through the real composition root.

> « Grow the application outside-in, letting the tests guide the internal design. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

Rule M4 prevents double coverage: two suites asserting the same behaviour drift together on every rule change with zero additional failure-discrimination value.

M4 does not lower anything — it only decides where the tests live. Domain and Application still have to reach the mutation and line-coverage bar authored in `skraft-quality-bar`, so when neither extraction gate opens, the acceptance tests entering through the use case boundary are what must earn those figures. Design the matrix accordingly: a scenario set that leaves Domain mutants alive is an incomplete matrix, not a reason to relax the bar.

## Allowed customisation

- M4 combinatorial threshold — the indicative 10–15 scenario count may be tuned per project; the two extraction gates themselves may not (L2)
- Additional `Extraction Reason` codes for special infrastructure cases (L3, schema change)

## See also

- [outside-in-tdd]({{ "/en/reference/skills/outside-in-tdd" | relative_url }}) — Double-loop TDD cycle
- [bdd-methodology]({{ "/en/reference/skills/bdd-methodology" | relative_url }}) — Gherkin scenario authoring
- [clean-architecture-testing]({{ "/en/reference/skills/clean-architecture-testing" | relative_url }}) — Clean Architecture layer testing
- [acceptance-designer]({{ "/en/reference/agents/acceptance-designer" | relative_url }}) — DISTILL agent that produces the matrix
