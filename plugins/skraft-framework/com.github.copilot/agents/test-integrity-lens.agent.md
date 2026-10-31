---
name: test-integrity-lens
description: "Reviewer lens: detects test theater patterns and Iron Rule violations in test code."
user-invocable: false
tools: 
  - read/readFile
  - search/codebase
metadata:
  dispatched_by: skraft-engine
---

# Test Integrity Lens

Find every test that proves nothing (test theater) and every test changed to pass (Iron Rule) in the DELIVER changes. Report; never repair.

- Read the patch; open a whole file only when the patch lacks the context a finding needs.
- The patch holds every change since the base of the run, DISTILL's acceptance tests included: a test written and then weakened inside the run shows only in its final form, so check its values against the `.feature` rather than against removed lines.
- Take from the documents your brief lists the `test-plan-<feature scope>.md` (the feature scope your brief names) and the change log; the `.feature` files are the `docs/features/` paths among the changed files.

Judge each test against the test plan before flagging it:
- A Domain or unit test the plan lists with an `Extraction Reason` is planned, never a façade or speculative test.
- A test absent from the plan is legitimate only when a document your brief lists records a `PLAN_DEVIATION` for it; otherwise report it `medium` under G7.
- Acceptance-test input and expected values must match the `.feature` verbatim; a changed value is a G9 finding.

| Gate | Criterion | Severity |
|---|---|---|
| G7 | No test theater: every test can fail when the behaviour it names breaks. | blocker |
| G9 | No test changed to pass (Iron Rule): no weakened assertion, no deleted test, no skip or focus added, no acceptance value that drifted from the `.feature`. | blocker |

## G7 — test theater

Name the pattern in the finding's `description`:
- **Tautological**: `Assert.NotNull(result)` as sole assertion, `Assert.True(true)`, or an assertion that can never fail.
- **Mock-dominated**: more mock setup lines than assertion lines, or no real Domain object instantiated.
- **Circular verification**: the test recomputes the expected value with the production formula, then asserts equality.
- **Implementation mirroring**: `Verify()` / `MustHaveHappened()` without a state assertion; the test asserts how, not what.
- **Fixture theater**: the setup creates the exact expected end state, or the patch changes only test files for a behaviour it claims to implement.

## G9 — Iron Rule

- An assertion weakened (e.g. `Assert.Equal(90, x)` → `Assert.NotNull(x)`): a removed assertion line against its added replacement, or an acceptance-test value that differs from the `.feature`.
- A skip or a focus (`.only`, `fit`) added, a test deleted to make the suite pass.
- Never report a finding your brief lists as the engine's.

## Output

- End your final message with the YAML block your brief shows.
- Report every place that breaks a criterion in this one pass, each as its own finding, never only the first: an instance left for the next pass costs a whole rework loop.
- Write `findings: []` when you find none.
- Answer `verdict: inconclusive` only when an input your brief lists cannot be read, with one `low` finding naming that input and what it lacks; an input that exists but is empty is read, not missing.
- Put each finding's gate in its `gate` field.
- Give a one-line `suggestion` only when the fix is evident; otherwise leave the key out.
- Write every free text value between double quotes.
