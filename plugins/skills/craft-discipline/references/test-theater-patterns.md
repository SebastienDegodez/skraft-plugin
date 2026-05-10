# Test Theater Patterns — Reference

Catalog of test anti-patterns that the `software-engineer` must detect
and reject during its TDD cycle, and that the reviewer verifies independently.

## Patterns

### 1. Tautological Test
A test that always asserts true regardless of the implementation.

**Signal:** `Assert.NotNull(result)` without any business assertion, `Assert.True(true)`.

**Example:**
```csharp
// THEATER — proves the constructor returns non-null, not a behavior
var result = handler.Handle(command);
Assert.NotNull(result);
```

### 2. Mock-Dominated Test
The test mocks everything except the SUT — you're testing mock configuration.

**Signal:** More mock setup lines than assertion lines. No real Domain objects.

**Example:**
```csharp
// THEATER — we're testing that FakeItEasy works
var repo = A.Fake<IRepository>();
var service = A.Fake<IService>();
A.CallTo(() => service.Calculate(A<int>._)).Returns(42);
var handler = new Handler(repo, service);
var result = handler.Handle(command);
Assert.Equal(42, result); // tests the mock, not the logic
```

### 3. Circular Verification
The production formula is copy-pasted into the test.

**Signal:** The test recalculates the expected value using the same logic as production.

**Example:**
```csharp
// THEATER — test and production use the same formula
var expected = basePrice * (1 + taxRate); // copy of production
Assert.Equal(expected, result.Total);
```

### 4. Implementation Mirroring
The test asserts HOW (method calls) instead of WHAT (observable result).

**Signal:** `Verify()` / `MustHaveHappened()` without any state assertion.

**Example:**
```csharp
// THEATER — verifies implementation, not behavior
handler.Handle(command);
A.CallTo(() => repo.Save(A<Entity>._)).MustHaveHappened();
// But no assertion on WHAT was saved!
```

### 5. Fixture Theater
Tests pass because fixtures create the expected end-state.

**Signal:** `git diff --name-only` between RED and GREEN shows only test files
changed — no production files were modified.

**Detection:**
```bash
git diff --name-only HEAD~1..HEAD -- src/
# If empty while tests pass → fixture theater
```
