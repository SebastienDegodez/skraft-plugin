---
name: craft-discipline
description: Use when a change looks finished and is about to be committed, or a phase has just turned green — the self-check the software-engineer runs before claiming the work is done. Not a review contract. The reviewer verifies artifacts independently.
---

# Craft Discipline

## Overview

12 self-discipline checkpoints for the `software-engineer`.
Run at every COMMIT & VERIFY phase, before committing.

**What this skill is NOT:** a review contract. A review lens that declares
it judges only with C10, C12 and the references; it never runs a command below.

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

Run the component's `build` command: your brief's, else `commands.build` of the component in
`skraft-config.json`, else the stack's standard one (`dotnet build`).

All projects compile without warnings. Treat warnings as errors.

### C4 — Format and static analysis pass

Run the component's `format` and `lint` commands the same way (brief, else `commands.format` and
`commands.lint` in `skraft-config.json`); a missing command is skipped. When the formatter has a
fix mode, run it first, then the check. Both report no finding, including one on a line the change
did not write; commit those fixes as `style`.

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
- Mocks allowed ONLY on output gateways (repositories, external services).

### C7 — Business language verified

Test names, variables, and assertions use business vocabulary
(see the project's FR→EN lexicon). No `test1`, `data`, `ProcessData`.

### C8 — mutation score meets the bar

In a skraft pipeline step, the engine's `mutation` gate runs the component's mutation command
and reports the survivors; never launch a mutation run inside a step.

1. Real survivor → write ONE test at the exact edge.
2. Equivalent mutant → suppress that one construct with a reason, the way the component's
   `quality-gates-<stack>` skill states.

Zero surviving mutants in Domain and Application (equivalent mutants suppressed with a reason).

### C9 — Conventional commit format

Use `git commit -s` with `type(feature): subject`, e.g.
`test(loyalty-discount): cover expired membership`. For a known issue, end the
body with `Refs: #N`, also on the commit that completes the issue: a commit never
closes an issue, the pull request body does. Omit the issue line when unknown.

### C10 — Object Calisthenics on Domain

Verify the 9 rules (see [references/object-calisthenics.md](references/object-calisthenics.md)).
Applicable to Domain code only.

### C11 — Parametrize Variations

Multiple input variants for the same behavior MUST be a single parameterized test
(`[Theory]/[InlineData]` in .NET, `@ParameterizedTest` in Java, `pytest.mark.parametrize` in Python),
not duplicated test methods. One test method per behavior, one row per case.

### C12 — Every test is planned

Every test the change adds is a row of the test plan or a step of the implementation plan, or the
change-log line of its commit records `PLAN_DEVIATION: {row} — {planned} → {actual} — {rule}`.
A Domain or unit test the test plan lists with an `Extraction Reason` is planned. A test in neither
plan with no such line: add the line, or remove the test.

## When to Execute

A pre-approved, staged documentation-only change with no applicable executable tests, build, or mutation targets is not a code COMMIT & VERIFY cycle. Check the exact approved content and changed paths, run applicable whitespace checks, and apply C9; do not invent code-gate results or create code-evidence artifacts.

| TDD Phase | Applicable Checkpoints |
|-----------|------------------------|
| PREPARE | None |
| RED | None |
| SYNTHESIZE-GREEN | C3 only (build) |
| COMMIT & VERIFY | **All (C1-C12)** |

## On Failure

- Red checkpoint → fix BEFORE committing.
- No exceptions, no `--ignore`.
- After 3 attempts on the same checkpoint: revert to green + escalate.

## References

- [Test Theater Patterns](references/test-theater-patterns.md)
- [Object Calisthenics](references/object-calisthenics.md)
