---
name: craft-discipline
description: Use when completing a TDD phase or before committing — self-discipline checkpoints the software-engineer runs against their own output. Not a review contract. The reviewer verifies artifacts independently.
---

# Craft Discipline

## Overview

10 self-discipline checkpoints for the `software-engineer`.
Run at every COMMIT & VERIFY phase, before committing.

**What this skill is NOT:** a review contract. The reviewer does not read
this skill. It audits artifacts independently through its own gates.

## Checkpoints

Execute in order. Each checkpoint must pass before proceeding.

### C1 — Acceptance test passes

```bash
dotnet test --filter "Category=Acceptance"
```

The acceptance test targeted by this iteration MUST pass. No `[Skip]`.

### C2 — All unit tests pass

```bash
dotnet test
```

Zero red tests. Zero ignored tests.

### C3 — Build passes

```bash
dotnet build
```

All projects compile without warnings. Treat warnings as errors.

### C4 — Static analysis passes

Verify that the linter/analyzer reports no new findings.

### C5 — No skipped tests or placeholder assertions

No `[Skip]`, `[Ignore]`, `#if false`, disabling comments,
or placeholder assertions in test bodies
(`assert.fail()` / `Assert.Fail()` / `Assert.True(false, ...)` /
`throw new NotImplementedException()` / `throw new Error('not implemented')`).
Skipped tests and placeholder assertions are both theater —
they pass the compile gate but assert nothing.

### C6 — No mocks in Domain/Application

Check UnitTest files:
- No `A.Fake<>()`, `Mock<>()`, `Substitute.For<>()`
  on a Domain or Application type.
- Mocks allowed ONLY on driven ports (repositories, gateways).

### C7 — Business language verified

Test names, variables, and assertions use business vocabulary
(see the project's FR→EN lexicon). No `test1`, `data`, `ProcessData`.

### C8 — 100% mutation score on business logic

**S7 DETERMINISTIC TOOL BRIDGE — execute via terminal, not prose.**

1. Run Stryker via `runInTerminal`:
```bash
dotnet stryker \
  --project <Domain-or-Application.csproj> \
  -tp <UnitTests.csproj> \
  --since:main \
  --break-at 100 \
  --reporter json --reporter cleartext
```
2. Parse output — extract survivors.
3. For real survivors → write boundary test → re-run scoped.
4. For equivalent mutants → document in code comment.

Zero surviving mutants in Domain and Application (equivalent mutants documented if accepted).

Load the [`mutation-testing`](../mutation-testing/SKILL.md) skill for full workflow.

### C9 — Conventional commit format

Format: `type(scope): subject`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.

### C10 — Object Calisthenics on Domain

Verify the 9 rules (see [references/object-calisthenics.md](references/object-calisthenics.md)).
Applicable to Domain code only.

### C11 — Parametrize Variations

Multiple input variants for the same behavior MUST be a single parameterized test
(`[Theory]/[InlineData]` in .NET, `@ParameterizedTest` in Java, `pytest.mark.parametrize` in Python),
not duplicated test methods. One test method per behavior, one row per case.

## When to Execute

| TDD Phase | Applicable Checkpoints |
|-----------|------------------------|
| PREPARE | None |
| RED | None |
| SYNTHESIZE-GREEN | C3 only (build) |
| COMMIT & VERIFY | **All (C1-C11)** |

## On Failure

- Red checkpoint → fix BEFORE committing.
- No exceptions, no `--ignore`.
- After 3 attempts on the same checkpoint: revert to green + escalate.

## References

- [Test Theater Patterns](references/test-theater-patterns.md)
- [Object Calisthenics](references/object-calisthenics.md)
