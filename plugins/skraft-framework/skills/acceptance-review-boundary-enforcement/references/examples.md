# Boundary-enforcement lens — examples

Worked examples of the gates of `acceptance-review-boundary-enforcement`, gate by gate.

## G7 — Layer Boundary Compliance

**Definition:** Each row in the coverage matrix (`test-plan-{story}.md`), the walking skeleton's included, targets an Application layer use case the event model `docs/domain/event-model/{bounded-context}.md` names (one of its Commands or Queries). No scenario targets an Infrastructure adapter as its primary entry point. An implementation-plan step that writes no scenario's acceptance test (an API, HTTP or Infrastructure test of a later circle) is no row of the matrix: never a G7 finding.

**How to check:**
1. Read the event model `docs/domain/event-model/{bounded-context}.md` of the story's bounded context — its Commands and Queries are the list of valid use case boundaries
2. Read `test-plan-{story}.md` — check the "Use Case Boundary" column for each row
3. Verify each boundary name appears in the event model as a Command or a Query
4. Flag any row that names an Infrastructure class (repository, adapter) as the entry point instead of a use case

**Severity:** BLOCKER — a test entering through Infrastructure instead of Application skips the business logic.

---

## G8 — Walking Skeleton

**Definition:** The story has a walking skeleton walking S1, tagged `@walking-skeleton`, in a back-end component: a plain test with no Gherkin that drives the real entry point through the use case to the real internal gateways (the database on Testcontainers), external gateways and clock as the infrastructure policy says (`test-design-mandates`). Or the test plan declares, under its `## Scenarios` table, `Walking skeleton exemption: <value>`, and the story's changes bear it out:

| Exemption | Holds when |
|---|---|
| `library` | the component is a pure library: no entry point at all |
| `refactoring` | the story and the patch add no public interface: no endpoint, command, message or public type |
| `docs-only` | the story changes configuration or documentation only: no source file |

**How to check:**
0. The `## Scenarios` table and its exemption line: S1 alone carries `@walking-skeleton`, in a back-end component when the configuration has one (a `react` front end only when it is the only component); a story that declares `Walking skeleton exemption:` declares `library`, `refactoring` or `docs-only`, tags no scenario `@walking-skeleton`, and `docs-only` holds only when no commit of the story changes a component's source.
1. No exemption: open the walking skeleton. It starts the component through its production composition root and sends the request, command or message the story's entry point takes; the use case and the internal gateways it reaches are the real ones, the database a Testcontainers container. A walking skeleton that calls the use case, uses an in-memory repository or is a Gherkin binding is a finding; so is an S1 with no acceptance test of its own.
2. An exemption: check it against the story and the patch; an entry point the component has (`library`), or a public interface the story adds (`refactoring`), is a finding.

**Severity:** BLOCKER — without a real walking skeleton, DELIVER builds every scenario on wiring nothing proved; an exemption the changes contradict hides that.

---

## G9 — Visual AC Evidence

**Definition:** Every scenario tagged `@visual` (a visual/positional/style AC per `bdd-methodology`)
has at least one corresponding Playwright E2E spec under `tests/e2e/`, referenced in
`impl-plan-{story}.md`. Its red is functional: it fails on roles and texts the page shows.
The screenshots are evidence the `visuals` step captures from the e2e run, judged there, never an
assertion of the acceptance test. A unit/jsdom test entry does NOT satisfy this gate.

**How to check:**
1. List all `@visual`-tagged scenarios in the `.feature` files
2. List all `tests/e2e/` entries in `impl-plan-{story}.md`
3. Verify each `@visual` scenario maps to ≥1 E2E spec asserting its roles and texts in a real
   browser
4. Flag any `@visual` scenario whose only planned coverage is a unit/jsdom test — jsdom renders
   no page, so what it asserts is never what the person sees

**Severity:** HIGH — a `@visual` AC closed only by a unit test is a structural proxy, not proof of
the rendered result; the real visual regression risk is uncaught.

---

## G10 — Comparable Contract Consistency

**Definition:** When `impl-plan-{story}.md` plans a component (hook, adapter, client) that plays the same role as one already implemented in a prior story for a comparable responsibility (e.g. two React hooks each wrapping a similar query, two API clients for sibling endpoints), the planned state/return/error convention must match the existing component's — same loading/error/data shape, same naming for the exposed fields — unless the impl-plan explicitly notes and justifies the divergence.

**How to check:**
1. List the components (hooks/adapters/clients) named in `impl-plan-{story}.md`, grouped by consumer category with any comparable components from prior stories' impl-plans or existing code.
2. For each group, compare the planned state/return/error shape.
3. Flag any pair whose shape differs with no justification recorded in the impl-plan notes.

**Auto-fail example:**
```
impl-plan-US-01.md: useDriverEligibility → { data, error, loading }
impl-plan-US-04.md: useDriverHistory      → { result, isError, pending }  (no rationale noted)
```

**Severity:** HIGH — an unexplained convention drift between comparable components is only caught
during DELIVER integration otherwise, after both implementations are already written.
