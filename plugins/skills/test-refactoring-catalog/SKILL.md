---
name: test-refactoring-catalog
description: Use when refactoring tests — extracting helpers, renaming for business clarity, deduplicating fixtures, consolidating parametrized cases, or restructuring test classes after GREEN phase without changing behavior coverage
---

# Test Refactoring Catalog

Safe transformations for test code that preserve behavioral coverage while
improving readability, maintainability, and signal-to-noise ratio.

## When to Load

- After GREEN: tests pass, you notice duplication or unclear naming.
- During COMMIT & VERIFY: cleanup before commit, no new behavior.
- Reviewing test code that smells (long arrange, repeated setup, cryptic names).

## Hard Rule

**Every refactoring below is behavior-preserving.** Run the full test suite
before AND after. If a test turns red, REVERT — the refactoring was wrong.

---

## Catalog

### R1 — Extract Arrange Helper

**Smell:** Multiple tests repeat the same 5+ lines of setup.

**Transform:**
```csharp
// Before — duplicated in 4 tests
var driver = new DriverInfo(Age: 25, LicenseYears: 5);
var vehicle = new VehicleInfo(Type: "sedan", Age: 2);
var policy = new EligibilityPolicy();

// After — one helper, parameters for what varies
private static EligibilityPolicy CreatePolicy() => new();
private static DriverInfo ADriver(int age = 25, int licenseYears = 5) =>
    new(Age: age, LicenseYears: licenseYears);
private static VehicleInfo AVehicle(string type = "sedan", int age = 2) =>
    new(Type: type, Age: age);
```

**Rules:**
- Helper name starts with `A`, `An`, or `Create` + business noun.
- Parameters only for what VARIES across tests. Defaults for the happy path.
- Helper lives in the same test class or a shared `TestKit` project.

---

### R2 — Rename for Business Intent

**Smell:** Test name describes implementation (`WhenHandlerIsCalled_ReturnsTrue`)
instead of business behavior.

**Transform:**
```csharp
// Before
public void Handle_ValidInput_ReturnsSuccess() { ... }

// After
public void WhenDriverMeetsAllCriteria_ShouldBeEligible() { ... }
```

**Pattern:** `When<BusinessCondition>_Should<BusinessOutcome>`

**Rules:**
- No technical words in test names (Handler, Service, Repository, Method).
- Use business vocabulary from the FR→EN lexicon.
- `Should` for expected outcomes, `ShouldNot` / `ShouldReject` for negative cases.

---

### R3 — Consolidate to Parametrized Test

**Smell:** N test methods that differ only in input values, same assertion structure.

**Transform:**
```csharp
// Before — 4 methods with identical structure
[Fact] public void WhenAge17_ShouldBeIneligible() { ... }
[Fact] public void WhenAge16_ShouldBeIneligible() { ... }
[Fact] public void WhenAge15_ShouldBeIneligible() { ... }

// After — one parametrized test
[Theory]
[InlineData(17)]
[InlineData(16)]
[InlineData(15)]
public void WhenDriverIsUnder18_ShouldBeIneligible(int age)
{
    var result = policy.Evaluate(ADriver(age: age), AVehicle());
    result.IsEligible.Should().BeFalse();
}
```

**Rules:**
- Keep the test name general enough to cover all rows.
- Each `[InlineData]` row must represent the same business scenario class.
- If assertions differ between rows → they are NOT the same scenario. Do NOT merge.

---

### R4 — Extract Custom Assertion

**Smell:** Complex multi-line assert repeated across tests.

**Transform:**
```csharp
// Before — repeated in 6 tests
Assert.False(result.IsEligible);
Assert.Equal("driver_too_young", result.Reason.Code);
Assert.Contains("18", result.Reason.Message);

// After
private static void ShouldBeRejectedWith(EligibilityResult result, string reasonCode)
{
    result.IsEligible.Should().BeFalse();
    result.Reason.Code.Should().Be(reasonCode);
}
```

**Rules:**
- Name: `ShouldBe<State>` or `ShouldHave<Property>`.
- Assert helper MUST fail with a clear message on mismatch.
- Never hide assertions inside helpers that also do arrange or act.

---

### R5 — Split Test Class by Scenario Group

**Smell:** One test class with 30+ tests covering multiple independent scenarios.

**Transform:**
```
// Before
EligibilityPolicyTests.cs (35 tests, 6 scenarios mixed)

// After
WhenDriverMeetsAllCriteria_EligibilityTests.cs
WhenDriverIsTooYoung_EligibilityTests.cs
WhenVehicleIsTooOld_EligibilityTests.cs
```

**Rules:**
- Each class = one business scenario group (one `When` clause).
- Shared helpers move to a base class or `TestKit`.
- File name matches class name exactly.

---

### R6 — Inline Trivial Helper

**Smell:** A helper called from exactly ONE test, adding indirection without value.

**Transform:** Inline the helper body back into the test.

**Rule:** If a helper is used once, it's not a helper — it's noise.

---

### R7 — Replace Magic Values with Named Constants

**Smell:** Numeric/string literals in tests with no business meaning visible.

**Transform:**
```csharp
// Before
var driver = new DriverInfo(Age: 25, LicenseYears: 5);

// After
private const int EligibleDriverAge = 25;
private const int MinimumLicenseYears = 5;
var driver = new DriverInfo(Age: EligibleDriverAge, LicenseYears: MinimumLicenseYears);
```

**Rules:**
- Only for values that represent a business threshold or boundary.
- Do NOT name obvious defaults (`0`, `1`, `null`) — they're clear as-is.
- Constant name uses business language, not technical (`MinAge`, not `THRESHOLD_1`).

---

## Decision Flow

```
Test smells detected after GREEN
        │
        ├── Duplicated setup? ──────────→ R1 (Extract Arrange Helper)
        ├── Unclear test name? ─────────→ R2 (Rename for Business Intent)
        ├── N similar test methods? ────→ R3 (Consolidate to Parametrized)
        ├── Repeated assertion block? ──→ R4 (Extract Custom Assertion)
        ├── Bloated test class? ────────→ R5 (Split by Scenario Group)
        ├── Single-use helper? ─────────→ R6 (Inline Trivial Helper)
        └── Magic values? ──────────────→ R7 (Replace with Named Constants)
```

## Anti-Patterns (DO NOT)

| Anti-pattern | Why it's wrong |
|--------------|----------------|
| Refactoring test AND production in same commit | Mixes concerns — can't tell if behavior changed |
| Extracting helper that hides the Act step | Test becomes unreadable — the "what" is gone |
| Renaming tests while red | You don't know if renaming broke something |
| Over-abstracting test setup into inheritance | Deep hierarchies kill test readability |
| Sharing mutable state via class fields | Tests become order-dependent — intermittent failures |
