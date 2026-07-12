---
layout: doc
lang: en
title: "bdd-methodology"
description: "Use when writing, reviewing, or structuring BDD scenarios in Gherkin format. Covers Given/When/Then conventions, scen..."
persona: tech-lead
---

# bdd-methodology

> Translate acceptance criteria into executable Gherkin specifications — Given/When/Then conventions, scenario patterns, tag strategy, and the 3-layer abstraction rule.

## When to use

- Before any Gherkin scenario authoring (DISTILL phase)
- To revise or restructure existing scenarios to align with domain vocabulary
- To choose between `Scenario`, `Scenario Outline`, `Background`, `And`, and `But`

## Entry contract

- `ac-draft-{story}.md` — story acceptance criteria
- Domain lexicon (ubiquitous language of the bounded context)
- INVEST story with persona, action, and observable outcome identified

## Exit contract

- `*.feature` files organised by bounded context (`{bounded-context}-{feature}.feature`)
- Scenarios covering: happy path, boundary conditions, business rule violations, error cases
- AC → scenario(s) traceability matrix

## Invariants

- **Core rule**: every word in a Gherkin scenario must be understood by a domain expert who has never seen code
- **One trigger per scenario** (single `When`) — two behaviours = two scenarios
- **3-layer rule**: Layer 1 (Gherkin) = pure domain vocabulary, zero technical terms
- **Visual AC rule**: an AC expressed in visual/positional/style terms is tagged `@visual` and requires a companion Playwright E2E test with a real measurement — a jsdom/unit test alone cannot close it

| Layer | Owner | Language |
|-------|-------|---------|
| Layer 1 — Gherkin | Business | Pure domain vocabulary. Zero technical terms. |
| Layer 2 — Step methods | Engineer (test code) | Translates Gherkin nouns/verbs to use case calls |
| Layer 3 — Application | Engineer (production code) | Use cases, repositories, domain objects |

**Anti-patterns to avoid:**

| Anti-pattern | Problem | Fix |
|---|---|---|
| `When I call POST /api/eligibility` | HTTP detail | `When the driver requests an eligibility check` |
| `Given the database contains a record` | Infrastructure | `Given a driver with a complete profile` |
| `Then the repository returns null` | Implementation | `Then no eligibility result is found` |
| Multiple `When` in one scenario | Single trigger | Two behaviours = two scenarios |

**Tag strategy:**

| Tag | Usage |
|---|---|
| `@{feature-name}` | One per bounded context feature (e.g., `@eligibility`) |
| `@happy-path` | The primary success scenario |
| `@edge-case` | Boundary values, limit conditions |
| `@error-case` | System errors, missing data, invalid state |
| `@smoke` | Minimal set for walking skeleton validation (mark ≤3 per feature) |
| `@visual` | Marks a scenario whose AC is visual/positional/style — requires a Playwright E2E test with a real measurement, cannot be closed by a jsdom unit test alone |

## Why this shape

BDD is a communication tool before it is a testing tool. A Gherkin scenario readable by a business expert ensures the engineer implements what the business expects — not what the engineer inferred from the ticket.

> « The goal of BDD is a shared understanding of the desired behaviour of software by both the business and engineering teams. »
> — North, D., *Introducing BDD*, 2006.

> « Scenarios are executable specifications that help teams define what software should do before building it. »
> — Adzic, G., *Specification by Example*, 2011.

## Allowed customisation

- Feature file naming (L1)
- Additional tags (L1)
- Scenario ordering within a feature (L1)

## See also

- [acceptance-review-criteria]({{ "/en/reference/skills/acceptance-review-criteria" | relative_url }}) — Gates G3 and G4 verify Gherkin vocabulary purity
- [acceptance-designer]({{ "/en/reference/agents/acceptance-designer" | relative_url }}) — Agent that produces feature files
- [outside-in-tdd]({{ "/en/reference/skills/outside-in-tdd" | relative_url }}) — TDD cycle that consumes Gherkin scenarios
