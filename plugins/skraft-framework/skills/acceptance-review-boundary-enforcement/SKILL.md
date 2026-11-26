---
name: acceptance-review-boundary-enforcement
description: "Use when reviewing DISTILL artefacts as the boundary-enforcement-lens, or self-checking them before the review: gates G7, G8, E1, E2, G9, G10. Checks that DISTILL acceptance tests enter through the use case, the walking skeleton through the real entry point, on the infrastructure the policy names."
---

# Boundary-enforcement lens — gates

Gates G7, G8, E1, E2, G9, G10 of the DISTILL review, the gates the `boundary-enforcement-lens` judges by. A finding's `gate` names one row below.

**Proven `existing` row:** `Priority` `existing`, and its Scenario cell names the covering test (file and test name, a test the research document lists under `Existing tests`), the command that ran it filtered to it, and its result `passed`. An `existing` row missing the test, the command or the result, or whose result is not `passed`, is exempt from neither G6 nor G7: it is a finding of each gate it would skip.


| Gate | ID | Definition | Pass condition | Fail severity |
|---|---|---|---|---|
| Layer boundary compliance | G7 | Each row in the coverage matrix, except a proven `existing` row (above), targets an Application layer use case the event model `docs/domain/event-model/{bounded-context}.md` names (one of its Commands or Queries); the walking skeleton's row names the use case its entry point reaches. No scenario targets an Infrastructure adapter directly as its primary entry point. An implementation-plan step that writes no scenario's acceptance test (an API, HTTP or Infrastructure test of a later circle) is no row of the matrix: never a G7 finding. | All coverage matrix entries reference a use case boundary the event model names. | BLOCKER |
| Walking skeleton | G8 | The story has a walking skeleton walking S1, tagged `@walking-skeleton`, in a back-end component: a plain test with no Gherkin that drives the real entry point (HTTP endpoint, CLI command, consumed message) through the use case to the real internal gateways (the database on Testcontainers), external gateways and clock as the infrastructure policy says; S1 keeps its own acceptance test beside it. Or the test plan declares `Walking skeleton exemption: <value>` under its Scenarios table and the story's changes bear it out: `library` (the component has no entry point), `refactoring` (no new endpoint, command, message or public type), `docs-only` (no source file changed). | The walking skeleton runs that real path, or the declared exemption holds. | BLOCKER |
| Use case only | E1 | The acceptance test of every scenario, S1 included, drives only the use case; the walking skeleton drives only the real entry point. It never calls or asserts on a domain internal, a repository implementation or an infrastructure class directly. Constructing the use case's real collaborators to hand them to its constructor, or the test host and containers of the walking skeleton, is wiring, not a finding. An integration test an implementation-plan step adds is no acceptance test. | Every call and assertion of the acceptance test goes through its entry's input and output. | BLOCKER |
| Infrastructure by policy | E2 | Each dependency the acceptance test reaches runs on what the infrastructure policy names for its scenario's stage (`test-design-mandates`; a component's `infrastructure` in `skraft-config.json` overrides it), as the test plan's `Double Type` writes it: a scenario's acceptance test (targeted), internal gateways in-memory, external gateways on Microcks, clock fake; walking skeleton, internal gateways on Testcontainers, external gateways on Microcks, clock fake. Never a double of a domain object or of the use case under test; never a hand-written fake where the policy names Microcks or Testcontainers. | Every dependency of the acceptance test runs on its policy's mechanism. | HIGH |
| Visual AC evidence | G9 | Every `@visual` scenario has ≥1 Playwright E2E spec in `tests/e2e/` per `impl-plan-{story}.md`. jsdom/unit entry invalid. | Bijection `@visual` scenarios ↔ Playwright E2E spec entries. | HIGH |
| Comparable contract consistency | G10 | When `impl-plan-{story}.md` plans a component (hook/adapter/client) that is comparable to one already implemented for a similar responsibility in a prior story, its planned state/return/error convention matches the existing component's, unless the plan notes an explicit, justified divergence. | Every comparable pair of planned components shares its convention, or the divergence is explicitly noted and justified in the impl-plan. | HIGH |

**Coverage matrix codes:** a row with `Layer = Domain` carries the `Extraction Reason` of `test-design-mandates` Mandate 4: `branch_unreachable_via_AC` (gate a: a branch no acceptance scenario can reach, a technical input guard included) or `combinatorial_economy` (gate b: a rule sweep that would explode the scenario count). A Domain row without one of these two codes, other than a proven `existing` row, is a G7 finding; a row with one is never a finding for its code alone.

**Checking E2:** the skeleton DISTILL writes in the production code (T3) is the real module the story fills, not a double; a stand-in for it inside the tests is one. A Microcks or Testcontainers dependency that cannot run because no container runtime answers is an environment problem, never a reason for a fake.

**Checking G8:** read the test plan's `## Scenarios` table and its exemption line: S1 alone carries `@walking-skeleton`, in a back-end component when the configuration has one (a `react` front end only when it is the only component); a story that declares `Walking skeleton exemption:` declares `library`, `refactoring` or `docs-only`, tags no scenario `@walking-skeleton`, and `docs-only` holds only when no commit of the story changes a component's source. Then the walking skeleton runs the real path and S1 has its own acceptance test besides; `library` holds only when the component has no entry point at all; `refactoring` only when the patch and the story add no public interface.

**Checking G9:**
1. List all scenarios tagged `@visual` in the `.feature` files
2. List all `tests/e2e/` spec entries in `impl-plan-{story}.md`
3. Verify each `@visual` scenario maps to ≥1 E2E spec asserting its roles and texts in a real browser; its screenshots are the `visuals` step's evidence, never an assertion of the acceptance test
4. Flag any `@visual` scenario whose only planned coverage is a unit/jsdom test

**Checking G10:**
1. List every client-side consumer (hook or client wrapper) named in `impl-plan-{story}.md` and the interface it wraps.
2. Scan sibling `impl-plan-*.md` files (other stories in the same or prior milestones) for a consumer wrapping a comparable interface (same shape class: list query, single-item query, command with optimistic update, ...).
3. When a comparable prior consumer exists, confirm `impl-plan-{story}.md` names it and states either "same convention as `{prior}`" or notes and justifies the divergence.
4. No comparable prior consumer in scope → gate is vacuously satisfied (nothing to compare against).
5. A named prior consumer with no convention statement, or a silent state-shape difference undetected by the plan → G10 HIGH fail.
