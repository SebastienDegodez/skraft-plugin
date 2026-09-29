---
name: craft-discipline
description: Use when a change looks finished and is about to be committed, or a phase has just turned green — the self-check the software-engineer runs before claiming the work is done. Not a review contract. The reviewer verifies artifacts independently.
---

# Craft Discipline

## Overview

11 self-discipline checkpoints (C1-C11) for the `software-engineer`.
Run at every COMMIT & VERIFY phase, before committing.

**What this skill is NOT:** a review contract. The reviewer does not read
this skill. It audits artifacts independently through its own gates.

## Checkpoints

Execute in order. Each checkpoint must pass before proceeding.

### C1 — Acceptance test passes

Run the acceptance test targeted by this iteration through the test command resolved by
`resolving-stack-commands`, narrowed to that test (for example by class name
`{Feature}AcceptanceTests`). It MUST pass and match at least one test.
No `[Skip]`, no `Skip = "..."`.

### C2 — All unit tests pass

Run the full test suite through the command resolved by `resolving-stack-commands`.
Zero red tests. Zero ignored/skipped tests.

### C3 — Build passes

Build the solution through the command resolved by `resolving-stack-commands`. Zero warnings:
the adapter (G4) assumes `TreatWarningsAsErrors=true` in the repository so a warning fails
the build; where it is absent, still treat any warning as a failure.

### C4 — Static analysis passes

The analyzers wired into the build report no finding (the C3 build is the G4 evidence).

### C5 — No skipped tests or placeholder assertions

No `[Skip]`, `[Ignore]`, `#if false`, disabling comments,
or placeholder assertions in test bodies
(`assert.fail()` / `Assert.Fail()` / `Assert.True(false, ...)` /
`throw new NotImplementedException()` / `throw new Error('not implemented')`).
Skipped tests and placeholder assertions are both theater —
they pass the compile gate but assert nothing.

### C6 — No mocks in Domain/Application

Check `<Context>.UnitTest` files (G7 `no-mocks-in-core.sh` is the enforcement):
- No mocking library at all: no `A.Fake<>()`, `Mock<>()`, `Substitute.For<>()`, `sinon`,
  `jest.fn`/`jest.mock`, `vi.fn`/`vi.mock`, `testdouble`, and no behaviour verification
  (`MustHaveHappened`, `Received`, `Verify`).
- Driven ports (repositories, gateways) are replaced by very simple hand-written InMemory
  doubles (a Dictionary / List behind the port interface, plus a recorded list when the
  test must observe something). Assert on the double's state or on the use-case result.
- Mocking/contract tools are allowed ONLY in `<Context>.IntegrationTest` for external systems.

### C7 — Business language verified

Test names, variables, and assertions use business vocabulary
(see the project's FR→EN lexicon). No `test1`, `data`, `ProcessData`.

### C8 — mutation score meets the bar

**S7 DETERMINISTIC TOOL BRIDGE — execute via terminal, not prose.**

1. Resolve the stack's adapter (`resolving-stack-commands`) and run its mutation
   scripts in order — core first, then boundary. Each script carries the threshold for
   its scope and returns the verdict as an exit code; `skraft-quality-bar` states the
   values. Never hand-assemble the runner invocation here.
2. Parse the adapter's JSON report and extract survivors.
3. For real survivors: write ONE boundary test, then re-run the applicable adapter gate for
   that scope (a narrowed `--mutate` run is diagnostic only).
4. For a proven equivalent mutant (Stryker.NET only) add a narrow
   `// Stryker disable once <Mutator>: <reason>` at the construct and re-run the gate; the
   Node adapter accepts none, so survivors there must be killed.

Zero surviving mutants in Domain and Application (a proven equivalent mutant is suppressed
as in step 4, never left as a plain comment).

Load the [`mutation-testing`](../mutation-testing/SKILL.md) skill for full workflow.

### C9 — Conventional commit format

Use `git commit -s` with `type(feature): subject`, e.g.
`test(loyalty-discount): cover expired membership`. For a known issue, end the
body with `Refs: #N` for intermediate work or `Closes #N` (no colon) only when the whole
issue is genuinely finished and all required gates pass. Omit the issue line
when unknown.

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
