---
name: bdd-methodology
description: Use when writing, reviewing, or structuring BDD scenarios in Gherkin format. Covers Given/When/Then conventions, scenario outline patterns, background usage, tag strategies, and domain language alignment. Load before any Gherkin authoring.
---

# BDD Methodology

## Overview

Behaviour-Driven Development translates acceptance criteria into executable specifications. Gherkin scenarios are the contract between the business (what it expects) and the engineer (what to implement).

**Core rule:** Every word in a Gherkin scenario must be understood by a domain expert who has never seen code.

## Mapping AC → Gherkin

Each acceptance criterion produces one or more scenarios. The mapping is explicit and traceable.

| AC type | Gherkin pattern |
|---|---|
| Happy path | `Scenario: {persona} {action} successfully` |
| Boundary condition | `Scenario: {persona} {action} at the limit` |
| Rejection / business rule violation | `Scenario: {persona} is rejected when {condition}` |
| Multiple inputs (parametrized) | `Scenario Outline` with `Examples` table |

**Mapping process:**
1. Read the AC — identify: **persona**, **action**, **expected outcome**
2. Identify the **precondition** → Given (state of the world before the action)
3. Identify the **trigger** → When (ONE business action only)
4. Identify the **observable result** → Then (business-visible outcome, never internal state)

## Gherkin Patterns

### Basic Scenario

```gherkin
Feature: Eligibility Check

  @eligibility @happy-path
  Scenario: Driver with a clean record obtains eligibility
    Given a driver with 5 years of experience and no accidents
    When the driver requests an eligibility check
    Then the driver is declared eligible
    And the eligibility certificate is valid for 30 days
```

### Scenario Outline (parametrized cases)

```gherkin
  @eligibility @edge-case
  Scenario Outline: Driver eligibility varies by accident count
    Given a driver with <accidents> accidents in the past 3 years
    When the driver requests an eligibility check
    Then the driver is <result>

    Examples:
      | accidents | result       |
      | 0         | eligible     |
      | 1         | eligible     |
      | 2         | not eligible |
      | 3         | not eligible |
```

### Background (shared preconditions for all scenarios in a feature)

```gherkin
  Background:
    Given the eligibility service is operational

  Scenario: Driver below minimum age is rejected
    Given a driver aged 17
    When the driver requests an eligibility check
    Then the driver is rejected with reason "below minimum age"
```

### And / But

```gherkin
  Scenario: Driver obtains eligibility with vehicle restrictions
    Given a driver with a B1 licence
    When the driver requests an eligibility check
    Then the driver is eligible
    And coverage is limited to vehicles under 3.5 tonnes
    But commercial transport is excluded
```

## Naming Conventions

| Element | Convention | Example |
|---|---|---|
| Feature file | `{bounded-context}-{feature}.feature` | `eligibility-check.feature` |
| Feature title | Business name of the feature | `Eligibility Check` |
| Scenario title | `{Persona} {business action} {outcome}` | `Driver with clean record obtains eligibility` |
| Steps | Business verb + domain noun | `the driver requests an eligibility check` |
| Scenario Outline | Same as Scenario, state the variable | `Driver eligibility varies by accident count` |

## Tag Strategy

```gherkin
@{feature} @{type}
Scenario: ...
```

| Tag | Usage |
|---|---|
| `@{feature-name}` | One per bounded context feature (e.g., `@eligibility`) |
| `@happy-path` | The primary success scenario |
| `@edge-case` | Boundary values, limit conditions |
| `@error-case` | System errors, missing data, invalid state |
| `@smoke` | Minimal set for walking skeleton validation (mark ≤3 per feature) |

## The 3-Layer Abstraction Rule

Gherkin operates at Layer 1. No technical leak is tolerated.

| Layer | Owner | Language |
|---|---|---|
| **Layer 1 — Gherkin** | Business | Pure domain vocabulary. Zero technical terms. |
| **Layer 2 — Step methods** | Engineer (test code) | Translate Gherkin nouns/verbs to use case calls |
| **Layer 3 — Application** | Engineer (production code) | Use cases, repositories, domain objects |

**Violations at Layer 1:**
- ❌ `When I call POST /api/eligibility` → HTTP detail
- ❌ `When I invoke the EligibilityApplicationService` → class name
- ❌ `When I set isEligible to true` → implementation
- ❌ `Given the database contains a record` → infrastructure
- ✅ `When the driver requests an eligibility check` → business action

## Anti-Patterns

| Anti-pattern | Problem | Fix |
|---|---|---|
| **UI testing in Gherkin** | `When I click Submit` | `When the driver submits the application` |
| **Too many steps** | >7 steps in one scenario | Split into smaller, focused scenarios |
| **Multiple When** | `When … And When …` | One trigger per scenario. Two behaviours = two scenarios. |
| **Incidental details** | Irrelevant data in Given | Use named personas or abstractions |
| **Vague Then** | `Then it works` | Assert specific, observable business outcome |
| **Technical identifiers** | `Given the DTO is populated` | `Given a driver with complete profile` |
| **Implementation leaking** | `Then the repository returns null` | `Then no eligibility result is found` |
| **Passive voice outcome** | `Then eligibility is checked` | `Then the driver is declared eligible` |

## Granularity Rule

**One scenario = one observable behaviour.**

If removing one step breaks the meaning, the scenario has the right granularity.
If a step can be removed without affecting the scenario's meaning, it is incidental — remove it.

**Scenario ordering per feature:**
1. Happy path (1-2 scenarios)
2. Boundary conditions (parametrize when >2 cases)
3. Rejection / business rule violations
4. Error cases (system failures, missing data)

## References

- [gherkin-patterns.md](references/gherkin-patterns.md) — pattern catalogue with domain examples
- [anti-patterns.md](references/anti-patterns.md) — anti-pattern catalogue with corrections
