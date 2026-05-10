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

### C5 — No skipped tests

No `[Skip]`, `[Ignore]`, `#if false`, or disabling comments
in tests. Every test is active.

### C6 — No mocks in Domain/Application

Check UnitTest files:
- No `A.Fake<>()`, `Mock<>()`, `Substitute.For<>()`
  on a Domain or Application type.
- Mocks allowed ONLY on driven ports (repositories, gateways).

### C7 — Business language verified

Test names, variables, and assertions use business vocabulary
(see the project's FR→EN lexicon). No `test1`, `data`, `ProcessData`.

### C8 — 100% mutation score on business logic

```bash
dotnet stryker
```

Zero surviving mutants in Domain and Application.
Equivalent mutants documented if accepted.

Load the `mutation-testing` skill if available.

### C9 — Conventional commit format

Format: `type(scope): subject`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.

### C10 — Object Calisthenics on Domain

Verify the 9 rules (see [references/object-calisthenics.md](references/object-calisthenics.md)).
Applicable to Domain code only.

## When to Execute

| TDD Phase | Applicable Checkpoints |
|-----------|------------------------|
| PREPARE | None |
| RED | None |
| SYNTHESIZE-GREEN | C3 only (build) |
| COMMIT & VERIFY | **All (C1-C10)** |

## On Failure

- Red checkpoint → fix BEFORE committing.
- No exceptions, no `--ignore`.
- After 3 attempts on the same checkpoint: revert to green + escalate.

## References

- [Test Theater Patterns](references/test-theater-patterns.md)
- [Object Calisthenics](references/object-calisthenics.md)
