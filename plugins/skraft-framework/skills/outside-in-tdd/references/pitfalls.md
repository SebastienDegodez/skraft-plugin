# Pitfalls of the cycle

Summaries and warnings of `outside-in-tdd`; the rules themselves are in `SKILL.md`.

## Quick Reference

| Phase | What | Success Criteria |
|---|---|---|
| **PREPARE** | Name the input and output boundaries, pick ONE scenario | The scenario under test is unambiguous |
| **RED** | Write test, stub until it compiles, run | Test fails on **behavior** (assertion), not compilation |
| **Guidance** (**MANDATORY**) | Orient the approach, **name the type and layer that will own the rule**, + **the failing test is inspected** | Owning type and layer stated before the implementation is written, the RED output has been seen by someone other than its implementer |
| **SYNTHESIZE GREEN** | Synthesize the smallest slice the test demands, clean the first time | Tests green, architecture respected, nothing built the test did not force |
| **COMMIT & VERIFY** | Wiring verification, coverage gate, commit | Production files in the diff, coverage gate run, red only in the story's `test` commit |

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "Compilation error IS red" | No. Compilation = wishful thinking. RED = behavior failure. |
| "I'll write dirty code then refactor" | That's 3-step TDD. SYNTHESIZE GREEN produces clean code. |
| "I can skip RED, I know it'll fail" | Run it. RED proves your test catches real failures. |
| "The placeholder fails, so it's RED" | No. A placeholder asserts nothing about the API (`craft-discipline` C5). Write the real call; let the missing symbol cause a compile error, then stub past it. |
| "All the tests pass, so the design is fine" | Green proves behavior, never placement. A tier table living in the handler passes every test and is still in the wrong layer. |

## Red Flags — STOP and Restart

- Entering the cycle at all while the expected result is still an open business decision
- Implementation code before RED is a behavior failure
- Compilation errors treated as RED
- Placeholder assertion in the test body — tests no behavior, produces false RED evidence
- Skipping RED entirely
- Skipping the architectural guidance checkpoint
- Proceeding to SYNTHESIZE GREEN before the failing test was inspected
- Refining code after SYNTHESIZE GREEN instead of revising RED

**Any of these mean:** Delete the code, start over with a proper RED.

## Anti-Patterns

- Strategic rules in orchestrators instead of domain
- Over-mocking that hides real business behavior
- Treating coverage as the quality signal — the bar is a floor, not evidence the tests assert
  anything; mutation score is the signal
- Duplicating acceptance test coverage with redundant domain tests

## Common Mistakes

| Mistake | Fix |
|---|---|
| Mocking domain objects in acceptance tests | Use real domain objects, mock only external boundaries |
| Designing domain objects upfront | Let domain emerge from test failures — don't design before testing |
| Treating compilation errors as RED | Stub to compile, then confirm failure on a business assertion |
| Placeholder assertion standing in for a real one | Call the API you wish existed; let the missing symbol fail the build |
| Committing when only test files changed | Post-GREEN verification via `git diff --name-only` |
| Modifying a failing test to pass | Iron Rule violation — fix the implementation or revert |
| Skipping the architectural guidance checkpoint | The failing test is inspected before any implementation is written |
| Writing every acceptance test up front and skipping all but one | Write them all and skip none (*All Acceptance Tests First*) — a skipped test is a false green |
| Skipping Gherkin ("too small") | Even small features benefit from behavior-first thinking |
| Polluting Gherkin with class/endpoint names | Keep scenarios in business language only |
| Testing data structures directly by default | Test policies/rules; data types are covered by usage |
