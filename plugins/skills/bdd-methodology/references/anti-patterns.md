# Gherkin Anti-Patterns — Catalogue

Each entry: **pattern name**, **example of the problem**, **why it's wrong**, **corrected version**.

---

## AP-01: UI Testing in Gherkin

**Problem:**
```gherkin
When I click the "Check Eligibility" button
Then the page shows "You are eligible"
```

**Why wrong:** Couples the scenario to the UI layer. If the UI changes, the business behaviour test breaks. Business behaviour is independent of presentation.

**Fix:**
```gherkin
When the driver requests an eligibility check
Then the driver is declared eligible
```

---

## AP-02: Too Many Steps (>7)

**Problem:**
```gherkin
Given a driver
And the driver has a licence
And the licence is valid
And the driver is over 18
And the driver has no accidents
And the vehicle is insured
And the policy period is set
When the driver submits the form
Then eligibility is confirmed
And an email is sent
And a PDF is generated
And the record is saved
```

**Why wrong:** Multiple behaviours in one scenario. Failure is hard to diagnose. Setup is fragile.

**Fix:** Split into scenarios per outcome. Use Background for shared setup. One observable outcome per scenario.

```gherkin
Background:
  Given a driver with a valid profile and clean record

Scenario: Driver obtains eligibility certificate
  When the driver requests an eligibility check
  Then the driver is declared eligible
  And the eligibility certificate is valid for 30 days

Scenario: Driver receives eligibility confirmation email
  When the driver requests an eligibility check
  Then the driver receives a confirmation at their registered email
```

---

## AP-03: Multiple When Clauses

**Problem:**
```gherkin
When the driver requests eligibility
And the system processes the request
And the result is stored
```

**Why wrong:** Only ONE business trigger per scenario. "And the system processes" describes internal mechanics, not a user action.

**Fix:**
```gherkin
When the driver requests an eligibility check
Then the eligibility result is available for the driver
```

---

## AP-04: Incidental Details (Test Data Noise)

**Problem:**
```gherkin
Given a driver with ID "DRV-2024-001" born on "1985-03-15" with licence number "B123456789FR" and 0 accidents since "2019-01-01"
```

**Why wrong:** Specific, irrelevant values leak into business scenarios. Brittle — if data format changes, test breaks.

**Fix:** Use personas or named abstractions:
```gherkin
Given a driver with a clean record and 5 years of experience
```

Or use a named example:
```gherkin
Given a standard eligible driver
```

---

## AP-05: Vague Then

**Problem:**
```gherkin
Then it works
Then the result is correct
Then the response is successful
```

**Why wrong:** Not testable. Not verifiable. Not business-meaningful.

**Fix:** State the specific, observable business outcome:
```gherkin
Then the driver is declared eligible
Then the driver is rejected with reason "licence suspended"
Then the application reference number is returned
```

---

## AP-06: Technical Identifiers in Steps

**Problem:**
```gherkin
Given the EligibilityApplicationService is instantiated with a mock repository
When I call checkEligibility(driverId: "123")
Then the EligibilityResult.status equals "ELIGIBLE"
```

**Why wrong:** Class names, method names, and field names at Layer 1 violate the 3-Layer Abstraction Rule.

**Fix:**
```gherkin
Given a driver with a clean record
When the driver requests an eligibility check
Then the driver is declared eligible
```

---

## AP-07: Implementation Leaking into Then

**Problem:**
```gherkin
Then the repository returns an EligibilityResult with status "ELIGIBLE"
Then the database record is updated with flag isEligible = true
Then HTTP 200 is returned with body {"eligible": true}
```

**Why wrong:** Asserts on internal state or transport layer, not business outcome. Test will break on refactoring even if behaviour is unchanged.

**Fix:**
```gherkin
Then the driver is declared eligible
Then the driver can proceed to application submission
```

---

## AP-08: Passive Voice Outcome

**Problem:**
```gherkin
Then eligibility is checked
Then a result is produced
Then the request is processed
```

**Why wrong:** Describes that something happened, not the business value of what happened. Not an assertion — it's a description.

**Fix:** Use active voice stating the business outcome:
```gherkin
Then the driver is declared eligible
Then the driver receives a rejection notice
```

---

## AP-09: Missing Given (Implicit State)

**Problem:**
```gherkin
Scenario: Driver is rejected
  When the driver requests an eligibility check
  Then the driver is rejected
```

**Why wrong:** The precondition is implicit. The test depends on shared state or a previous test. Ordering-dependent tests are fragile.

**Fix:** Always make the precondition explicit:
```gherkin
Scenario: Driver with suspended licence is rejected
  Given a driver with a currently suspended licence
  When the driver requests an eligibility check
  Then the driver is rejected with reason "licence suspended"
```

---

## AP-10: Duplicated Scenarios (No Scenario Outline)

**Problem:**
```gherkin
Scenario: Driver with 0 accidents is eligible
  Given a driver with 0 accidents
  When the driver requests an eligibility check
  Then the driver is eligible

Scenario: Driver with 1 accident is eligible
  Given a driver with 1 accident
  When the driver requests an eligibility check
  Then the driver is eligible

Scenario: Driver with 2 accidents is not eligible
  Given a driver with 2 accidents
  When the driver requests an eligibility check
  Then the driver is not eligible
```

**Why wrong:** Repetition. Hard to maintain. Outline exists for this.

**Fix:**
```gherkin
Scenario Outline: Driver eligibility varies by accident count
  Given a driver with <accidents> accidents
  When the driver requests an eligibility check
  Then the driver is <result>

  Examples:
    | accidents | result       |
    | 0         | eligible     |
    | 1         | eligible     |
    | 2         | not eligible |
```
