# Testability lens — examples

Worked examples of the gates of `acceptance-review-testability`, gate by gate.

## G5 — Step Unambiguity

**Definition:** Every step can be implemented by any engineer without asking the designer for clarification. The step's meaning is unambiguous within the domain vocabulary.

**How to check:**
For each step, apply the "two engineers" test:
> "Could two engineers implement this step differently and both be correct?"

If YES → ambiguous → flag.

**Common ambiguities:**
- `Given a valid driver` — what makes a driver valid? Define it.
- `When the system processes the request` — not a user action; what action exactly?
- `Then the result is positive` — positive in what business sense?

**Severity:** HIGH

---

## G6 — Implementation Plan Completeness

**Definition:** Every scenario in the `.feature` files has a corresponding entry in `impl-plan-{story}.md` with a file path and a use case boundary.

**How to check:**
1. List all scenario titles from `*.feature`
2. List all entries in `impl-plan-{story}.md`
3. Verify bijection
4. The group table: every scenario of the `## Scenarios` table in exactly one group, no number the table does not list, S1 in group 1

**Severity:** HIGH — DELIVER cannot start if a scenario has no implementation entry.

---

## G11 — Inner-Loop Boundary Presence

**Definition:** Each test lives where its kind puts it, per `clean-architecture-testing`, and the file physically exists in the repo, referenced from `impl-plan-{story}.md`:

| Test | Place | Entry |
|---|---|---|
| Walking skeleton (a plain test, no Gherkin, walking S1 tagged `@walking-skeleton`) | the integration-test place of its component | the real entry point (HTTP endpoint, CLI command, consumed message) |
| Acceptance test of every scenario, S1 included (the binding of its Gherkin) | the unit-test place of its component's language | the use case boundary (Application layer) |

| Language | Unit-test place | Integration-test place |
|---|---|---|
| .NET | a `tests/<Context>.UnitTest/` project (`.UnitTests`, `.Unit.Test`, `.Unit.Tests`, `.Test` and `.Tests` too); a project whose name ends in none of these never is it | `<Context>.IntegrationTest(s)` or `<Context>.Integration.Test(s)` |
| Java | a `*Test` class (Surefire) in the `src/test` of the module that holds the use case, or the `<context>-unit-test(s)` module | an `*IT` class (Failsafe) in the `src/test` of the entry-point module, whose `pom.xml` carries `spring-boot-maven-plugin` or `quarkus-maven-plugin`, or the `<context>-integration-test(s)` module; a test starting the application (`@SpringBootTest`, `@QuarkusTest`, `@QuarkusIntegrationTest`) is always an `*IT` |
| Any other (TypeScript, JavaScript, Python, React…) | a `unit` folder right under the component's test path in `skraft-config.json` (`tests/unit/`, `test/unit/`), or that test path itself when it is named `unit` | an `integration` folder right under it |

**Why this gate exists:** `outside-in-tdd`'s Concentric circles put the Application-layer acceptance test of a targeted scenario in the fast unit suite, and the walking skeleton's real path in the integration suite. A targeted scenario covered only by an HTTP or Integration test is one circle removed from the boundary DELIVER implements against; a walking skeleton entering through the use case proves no wiring. G1–G10 check Gherkin and plan artefacts, never the test files on disk.

**How to check:**
1. Find the scenarios in the test plan's `## Scenarios` table: the component of each, and whether the story declares a walking skeleton exemption.
2. Search the place each kind takes (tables above): the walking skeleton (unless exempt) and the acceptance test of every scenario.
3. Flag a missing file, a file in the other place, or a test entering anywhere but its entry.

**Auto-fail example:**
```
test-plan-eligibility.md: S1 "Driver checks eligibility" — @walking-skeleton, component api (.NET)
Repo search: tests/Eligibility.UnitTest/Features/Eligibility/EligibilityAcceptanceTests.cs (found, calls CheckEligibilityUseCase)
             tests/Eligibility.IntegrationTest/** (NOT FOUND)
→ G11 BLOCKER: S1's acceptance test is there, but no walking skeleton enters through the real entry point.

test-plan-checkout.md: S1 "Customer pays an order" — exempt (library), component JavaScript, test path tests/
Repo search: tests/pay.test.mjs (found, at the test path root)
             tests/unit/** (NOT FOUND)
→ G11 BLOCKER: the acceptance test is not in tests/unit/.
```

**Severity:** BLOCKER — the RED the test proves (T3) is not a RED of the boundary DELIVER must implement against.
