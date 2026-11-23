# Gherkin Patterns — Catalogue

## Pattern 1: Standard Scenario (Happy Path)

**Use when:** One input, one outcome, no parametrization needed.

```gherkin
@eligibility @happy-path
Scenario: Driver with a clean record obtains eligibility
  Given a driver with 5 years of driving experience and no accidents
  When the driver requests an eligibility check
  Then the driver is declared eligible
  And the eligibility certificate is valid for 30 days
```

---

## Pattern 2: Scenario Outline (Parametrized)

**Use when:** Same behaviour with multiple input variants (>2 cases).

```gherkin
@eligibility @edge-case
Scenario Outline: Driver eligibility threshold varies by accident history
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

---

## Pattern 3: Background (Shared Preconditions)

**Use when:** Multiple scenarios in a feature share the same Given context.

```gherkin
Feature: Eligibility Check

  Background:
    Given the eligibility service is operational
    And the minimum driving age requirement is 18

  @eligibility @error-case
  Scenario: Driver below minimum age is rejected
    Given a driver aged 17
    When the driver requests an eligibility check
    Then the driver is rejected with reason "below minimum age"

  @eligibility @happy-path
  Scenario: Driver at minimum age is accepted
    Given a driver aged 18 with a valid licence
    When the driver requests an eligibility check
    Then the driver is declared eligible
```

---

## Pattern 4: Rejection / Business Rule Violation

**Use when:** A business rule blocks the outcome.

```gherkin
@eligibility @error-case
Scenario: Driver with suspended licence is rejected
  Given a driver with a currently suspended licence
  When the driver requests an eligibility check
  Then the driver is rejected
  And the rejection reason is "licence suspended"
```

---

## Pattern 5: State Verification (Post-action check)

**Use when:** The outcome changes a persistent state that must be verifiable.

```gherkin
@application @happy-path
Scenario: Submitted application is tracked for review
  Given an eligible driver with a complete application
  When the driver submits the insurance application
  Then the application status is "awaiting review"
  And the driver receives a confirmation reference number
```

---

## Pattern 6: Domain Event (Observable side effect)

**Use when:** The business cares about a domain event triggered by the action.

```gherkin
@eligibility @happy-path
Scenario: Eligibility check triggers an audit entry
  Given a driver with a clean record
  When the driver requests an eligibility check
  Then the driver is declared eligible
  And an eligibility audit entry is recorded for the driver
```

---

## Pattern 7: Absence / Negative Assertion

**Use when:** The expected outcome is the absence of something.

```gherkin
@eligibility @error-case
Scenario: Incomplete driver profile produces no eligibility result
  Given a driver with an incomplete profile missing the licence number
  When the driver requests an eligibility check
  Then no eligibility result is returned
  And the driver is informed that the profile is incomplete
```

---

## Feature File Structure

```gherkin
Feature: {Business Feature Name}
  {Optional: 1-2 sentence business description}

  Background:
    {Shared preconditions — only if ≥2 scenarios share them}

  @{feature} @happy-path
  Scenario: {Happy path title}
    ...

  @{feature} @edge-case
  Scenario Outline: {Parametrized variant title}
    ...
    Examples:
      | col1 | col2 |
      | ...  | ...  |

  @{feature} @error-case
  Scenario: {Rejection title}
    ...
```

---

## Domain Examples by Feature

### Auto Insurance — Eligibility

| Scenario type | Example |
|---|---|
| Happy path | Driver with clean 5-year record |
| Age boundary | Driver aged exactly 18 (minimum) |
| Accident threshold | Driver with 1 accident (eligible) vs 2 (not eligible) |
| Licence suspended | Immediate rejection |
| Incomplete profile | Missing licence number, no result |

### Auto Insurance — Application Submission

| Scenario type | Example |
|---|---|
| Happy path | Eligible driver submits complete application |
| Missing eligibility | Driver submits without prior eligibility check |
| Duplicate submission | Driver submits twice for same period |
| Coverage selection | Driver selects optional coverage add-ons |
