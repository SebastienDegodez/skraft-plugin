# Testing Workers — Mocking & Contract Testing : User Stories

> Basé sur le spec `2026-06-09-testing-workers-mocking-contract-design.md`.
> Référence : branche `feat/contract-testing-agents`.
> Raffinées au format `story-template.md` (issue-refinement) : Given/When/Then,
> domain examples, DoR checklist, effort.
>
> **✅ Gherkin approuvé par l'opérateur le 2026-06-09 — lenses acceptance-review-criteria skippées.**

---

## Épopées

| ID | Épopée |
|---|---|
| E1 | Mock d'intégration (consommateur) |
| E2 | Contract testing (fournisseur) |
| E3 | Configuration unifiée |
| E4 | Review automatique |
| E5 | Extensibilité par stack |

---

## E1 — Mock d'intégration (consommateur)

### US-01 — Dispatch du worker de mock

**As** `software-engineer` (lead) executing Outside-In TDD in the DELIVER phase,
**I want** to fan-out to `mock-integration-worker` when a slice requires downstream isolation,
**so that** mock wiring is resolved and scaffolded without polluting my TDD loop.

#### Domain Examples

1. DELIVER slice for the Eligibility API that calls an external Insurance Rating API — lead identifies the mock trigger, dispatches worker, receives `{status: ok, strategy: microcks, stack: dotnet, files: ["test/Eligibility.IntegrationTests/EligibilityWebApplicationFactory.cs"], testCommand: "dotnet test"}` and integrates the files into its TDD loop.
2. Same slice with prompt "use Moq" — worker returns `{status: ok, strategy: inprocess, library: moq, ...}` and lead proceeds with the Moq scaffold.
3. Worker detects a Java stack with no adapter registered — returns `{status: blocked, type: unsupported_stack}` and lead surfaces the blocker without inventing a wiring.

#### Acceptance Criteria

**AC-01:** Mock trigger is identified and delegated
Given a DELIVER slice whose `impl-plan` shows a downstream HTTP dependency the SUT calls
When `software-engineer` encounters the intent "mock the downstream"
Then `software-engineer` dispatches `mock-integration-worker` with the downstream descriptor
And does NOT write any mock file before receiving the worker's structured result

**AC-02:** Structured result is consumed before TDD continues
Given `mock-integration-worker` returns `{status: ok, strategy, stack, files[], testCommand}`
When the lead receives the result
Then the lead executes `testCommand` via the terminal (S7) to confirm RED on a business assertion
And only then integrates the returned files into its own TDD loop

**AC-03:** Blocked payload is surfaced verbatim
Given `mock-integration-worker` returns `{status: blocked, type: unsupported_stack}`
When the lead receives the blocked payload
Then the lead surfaces the blocker verbatim to the orchestrator
And does NOT invent a mock wiring

#### Technical Notes
- Dispatch is via the `agent` tool — `user-invocable: false` means only `software-engineer` can invoke the worker.
- The worker never commits; only the lead commits (one-writer rule).
- `testCommand` must come from `resolving-stack-commands` — never hardcoded.

#### Dependencies
- US-07 — `mock-integration-worker` must exist before the lead can dispatch it.
- US-04 — TIER-1 verify (S7+A9) is the gate before file integration.

#### Effort
S — Extends an existing agent (pattern already in `software-engineer`); fan-out trigger + TIER-1 gate are batch-editable.

#### DoR Checklist
- [x] Problem statement articulates a user problem (not "implement X")
- [x] Specific persona named (`software-engineer` lead, DELIVER phase)
- [x] 3 domain examples with concrete values (downstream name, returned payload, blocked case)
- [x] UAT scenarios written in Given/When/Then (AC-01, AC-02, AC-03)
- [x] Each AC traces back to a domain example
- [x] Right-sized: S — single agent edit, 2 new triggers
- [x] Technical notes added (one-writer rule, S7 constraint)
- [x] Dependencies listed (US-07, US-04)

---

### US-02 — Stratégie Microcks par défaut

**As** a developer using skraft on a .NET project,
**I want** the mock strategy to default to Microcks (container seeded from the downstream contract + WAF scaffold on mock URL),
**so that** my team gets a production-realistic mock without writing any configuration.

#### Domain Examples

1. `.github/instructions/skraft.instructions.md` absent from the repo — `mocking-strategy-roster` resolves `strategy: microcks`, loads `mocking-microcks-dotnet`, and emits `MicrocksContainerEnsemble` seeded from the downstream OpenAPI contract.
2. File present but `testing.mocking.*` keys omitted — same resolution path, default cascade fires.
3. Prompt says "set up Microcks for the downstream Pastry API" — roster recognises the explicit Microcks intent and confirms the default strategy.

#### Acceptance Criteria

**AC-01:** Absent configuration resolves to Microcks
Given `.github/instructions/skraft.instructions.md` is absent or contains no `testing.mocking.strategy` key
When `mocking-strategy-roster` resolves the strategy
Then it returns `strategy: microcks` with `source: default`
And it links to the `mocking-microcks-dotnet` adapter

**AC-02:** Generated scaffold wires the SUT's client to the mock endpoint
Given the roster resolved `(microcks, dotnet)`
When `mocking-microcks-dotnet` emits the scaffold
Then it contains `MicrocksContainerEnsemble` seeded via `WithMainArtifacts` from the downstream contract
And the SUT's downstream base URL is pointed at `GetRestMockEndpoint` via `UseSetting`

**AC-03:** No Microcks container in a non-default override
Given `testing.mocking.strategy: inprocess` is set (US-03)
When the scaffold is emitted
Then no `MicrocksContainerEnsemble` or Microcks image reference appears in the generated files

#### Technical Notes
- Microcks image: `quay.io/microcks/microcks-uber:1.14.0-native` (pinned in the adapter).
- `GetRestMockEndpoint("{name}", "version")` — service name uses `+` to encode spaces (e.g. `"API+Pastries"`).
- Assertion mock-was-hit: `VerifyAsync` / `GetServiceInvocationsCountAsync` — consumer-side only, not provider contract.

#### Dependencies
- US-01 — worker must dispatch this path.
- US-08 — configuration file template must define the `testing.mocking.strategy` key.

#### Effort
S — New adapter file, roster routing table row. Pattern mirrors `resolving-stack-commands`.

#### DoR Checklist
- [x] Problem statement articulates a user problem
- [x] Specific persona (developer, .NET project, no config)
- [x] 3 domain examples (absent file, keys omitted, prompt confirms)
- [x] UAT scenarios in Given/When/Then (AC-01, AC-02, AC-03)
- [x] Each AC traces to a domain example
- [x] Right-sized: S
- [x] Technical notes added (image version, URL encoding)
- [x] Dependencies listed (US-01, US-08)

---

### US-03 — Override vers une lib in-process

**As** a developer whose team standardises on in-process test doubles,
**I want** to set `testing.mocking.strategy: inprocess` (and optionally `testing.mocking.library: moq`) in `skraft.instructions.md`,
**so that** my team gets a Moq / FakeItEasy / NSubstitute double instead of a Microcks container.

#### Domain Examples

1. `strategy: inprocess` and `library: moq` in the file — roster reads both keys, loads `mocking-inprocess-dotnet`, emits a `Mock<IDownstreamClient>` registered in the WAF DI. No container.
2. `strategy: inprocess` but no `library` key — roster falls back to the adapter's priority table (FakeItEasy first), emits `A.Fake<IDownstreamClient>()`.
3. `strategy: inprocess` and `library: wiremock` (unknown) — roster emits `{status: blocked, type: unsupported_mocking_library}` and does NOT generate any wiring.

#### Acceptance Criteria

**AC-01:** Strategy and library are read from the file by tool call
Given `testing.mocking.strategy: inprocess` is in `.github/instructions/skraft.instructions.md`
When `mocking-strategy-roster` resolves the strategy
Then it reads the value via a file tool call (S6), not from recall
And `source: skraft.instructions.md` is recorded in the result

**AC-02:** In-process double is registered in the test host, no container
Given the roster resolved `(inprocess, dotnet)` with `library: moq`
When `mocking-inprocess-dotnet` emits the scaffold
Then the test factory uses `new Mock<IDownstreamClient>()` registered via `services.AddSingleton`
And no Microcks image or container reference appears in the generated files

**AC-03:** Unknown library returns a structured BLOCKER
Given `testing.mocking.library: wiremock` is set (not in `{moq, fakeiteasy, nsubstitute}`)
When `mocking-strategy-roster` resolves the library
Then it returns `{status: blocked, type: unsupported_mocking_library}`
And no mock wiring is generated

#### Technical Notes
- Library priority (no `library` key): `fakeiteasy` > `nsubstitute` > `moq` — adapter table order is authoritative.
- The prompt beats the file: "use Moq here" overrides any `library` set in the file.
- Doubles the downstream CLIENT interface (e.g. `IShippingClient`), never the SUT's domain types.

#### Dependencies
- US-01 — dispatch path.
- US-02 — default path must not fire when override is resolved.
- US-08 — configuration namespace `testing.mocking.*`.

#### Effort
S — New adapter file + roster routing row. Pattern mirrors the Microcks adapter.

#### DoR Checklist
- [x] Problem statement articulates a user problem
- [x] Specific persona (developer, team standards)
- [x] 3 domain examples (moq set, no library set, unknown library)
- [x] UAT scenarios in Given/When/Then (AC-01, AC-02, AC-03)
- [x] Each AC traces to a domain example
- [x] Right-sized: S
- [x] Technical notes added (priority table, prompt wins, doubles downstream)
- [x] Dependencies listed (US-01, US-02, US-08)

---

### US-04 — Vérification TIER-1 par le lead

**As** `software-engineer` (lead),
**I want** to execute the `testCommand` returned by the mock worker and enforce RED→GREEN (A9),
**so that** I never commit mock wiring that I have not personally verified against a failing test.

#### Domain Examples

1. Worker returns `{testCommand: "dotnet test --filter Category=Integration"}` — lead runs the command in the terminal, observes RED on a business assertion (e.g. `Assert.Equal(expected, actual)` fails), then drives GREEN.
2. Worker's result has no `testCommand` field (edge case) — lead resolves the command via `resolving-stack-commands` before running it.
3. Worker returned `{status: blocked}` — lead surfaces the blocker and skips the TIER-1 gate; does NOT invent a command.

#### Acceptance Criteria

**AC-01:** `testCommand` is executed via the terminal before file integration
Given `mock-integration-worker` returned `{status: ok, testCommand: "dotnet test ..."}`
When the lead receives the result
Then the lead runs `testCommand` via `execute/runInTerminal`
And confirms the test is RED on a business assertion before adding the returned files to the working tree

**AC-02:** Missing `testCommand` triggers resolution, not recall
Given the worker's result does not include a `testCommand` field
When the lead needs to verify the wiring
Then the lead resolves the command via `resolving-stack-commands` (S7)
And never hardcodes `dotnet test`

**AC-03:** Blocked payload skips TIER-1
Given `mock-integration-worker` returned `{status: blocked}`
When the lead processes the result
Then the lead surfaces the blocker without running any test command
And does NOT attempt to recover by inventing wiring

#### Technical Notes
- TIER-1 (S7+A9): the lead owns execution; the worker never runs tests.
- RED must be on a BUSINESS assertion, not a compilation error (compile enough to run first).
- A passing test without a prior RED is not acceptable — the gate requires witnessing the failure.

#### Dependencies
- US-07 — worker must be implemented to return `testCommand`.

#### Effort
XS — Instruction added to `software-engineer`'s existing TIER-1 section; no new file.

#### DoR Checklist
- [x] Problem statement articulates a user problem
- [x] Specific persona (`software-engineer` lead)
- [x] 3 domain examples (testCommand present, absent, blocked)
- [x] UAT scenarios in Given/When/Then (AC-01, AC-02, AC-03)
- [x] Each AC traces to a domain example
- [x] Right-sized: XS — edit within existing agent instruction
- [x] Technical notes added (RED on business assertion, no hardcoded command)
- [x] Dependencies listed (US-07)

---

## E2 — Contract testing (fournisseur)

### US-05 — Baseline WAF + HttpClient inconditionnelle

**As** `software-engineer` (lead) delivering a .NET API slice,
**I want** `contract-testing-worker` to always emit a `WebApplicationFactory` + `HttpClient` integration test,
**so that** every API slice is covered by an in-process integration test regardless of opt-in settings.

#### Domain Examples

1. `.github/instructions/skraft.instructions.md` absent — worker emits only the baseline `{Api}ContractTests.cs` asserting status code, content type, and `ProblemDetails` shape on the 404 path.
2. `testing.contract.microcks: false` explicitly set — same baseline-only output.
3. `testing.contract.microcks: true` set — worker emits the baseline PLUS the Microcks layer (US-06); the baseline file is unchanged.

#### Acceptance Criteria

**AC-01:** Absent or false opt-in → baseline only
Given `.github/instructions/skraft.instructions.md` is absent or has `testing.contract.microcks: false`
When `contract-testing-worker` emits the contract test
Then it produces ONLY the `WebApplicationFactory` + `HttpClient` test
And no `MicrocksContainer`, `TestEndpointAsync`, or `TestRequest` reference appears

**AC-02:** Baseline always asserts the observable response contract
Given the baseline is emitted for any .NET API
When the test runs against the `WebApplicationFactory` host
Then it asserts the HTTP status code
And it asserts the `Content-Type` header (`application/problem+json` on error paths)
And it asserts the `ProblemDetails` shape (`Status`, `Type`, or `Title` on at least one error scenario)

**AC-03:** Opt-in true stacks Microcks on top without touching the baseline
Given `testing.contract.microcks: true`
When the worker emits both files
Then the baseline file (`{Api}ContractTests.cs`) is identical to what it would be without the opt-in
And the Microcks layer is in a separate file (`{Api}ContractVerification.cs`)

#### Technical Notes
- The baseline uses `IClassFixture<WebApplicationFactory<Program>>` — no external container.
- `ProblemDetails` assertion: `Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType)`.
- The worker never commits; only the lead commits after TIER-1 verify.

#### Dependencies
- US-12 — `contract-testing-worker` must exist.
- US-08 — `testing.contract.*` namespace in the config file.

#### Effort
S — New worker + adapter; baseline layer is the simpler of the two.

#### DoR Checklist
- [x] Problem statement articulates a user problem
- [x] Specific persona (`software-engineer` lead, .NET slice)
- [x] 3 domain examples (absent file, false, true)
- [x] UAT scenarios in Given/When/Then (AC-01, AC-02, AC-03)
- [x] Each AC traces to a domain example
- [x] Right-sized: S
- [x] Technical notes added (`IClassFixture`, `ProblemDetails` assertion)
- [x] Dependencies listed (US-12, US-08)

---

### US-06 — Couche Microcks opt-in (additive)

**As** a developer whose team wants Microcks to replay contract examples against our running service,
**I want** to set `testing.contract.microcks: true` in `skraft.instructions.md`,
**so that** `TestEndpointAsync(OPEN_API_SCHEMA)` is added on top of the WAF baseline without replacing it.

#### Domain Examples

1. `testing.contract.microcks: true` — worker emits baseline file PLUS a `{Api}ContractVerification.cs` containing `MicrocksContainer.TestEndpointAsync(TestRequest{ OPEN_API_SCHEMA })` pointed at `host.testcontainers.internal:{port}`.
2. Same run with `testing.contract.microcks: false` (toggled off) — diff contains zero Microcks references; only the baseline file.
3. Prompt "verify with Microcks too" (no file) — prompt opt-in wins, same two-layer output as example 1.

#### Acceptance Criteria

**AC-01:** `testing.contract.microcks: true` adds the Microcks verification layer
Given `testing.contract.microcks: true` is in `.github/instructions/skraft.instructions.md`
When `contract-testing-dotnet` emits the contract test
Then the baseline `WebApplicationFactory` + `HttpClient` test is present
And a `TestEndpointAsync(TestRequest{ RunnerType = OPEN_API_SCHEMA })` provider test is present in a separate file
And `TestEndpointAsync` targets `http://host.testcontainers.internal:{port}/api`

**AC-02:** `TestResult.Success` is asserted — never suppressed
Given the Microcks layer is emitted
When the verification test runs
Then `Assert.True(testResult.Success, ...)` is present
And the test cannot be marked `[Skip]` without a hard defect from `contract-fidelity-lens`

**AC-03:** Setting the flag to `false` leaves no Microcks trace
Given `testing.contract.microcks: false` is set (or the key is absent)
When the worker emits the contract test
Then no `MicrocksContainer`, `TestRequest`, or `TestEndpointAsync` reference appears in the diff

#### Technical Notes
- Provider-side: Microcks CALLS our service via `host.testcontainers.internal`. This is NOT `VerifyAsync` (which asserts a consumer mock was hit).
- `TestcontainersSettings.ExposeHostPortsAsync(port)` must be called so Microcks can reach the Kestrel port.
- The ensemble seeding uses generic contract artifacts from the `contract-testing` skill.

#### Dependencies
- US-05 — baseline layer must always be emitted alongside.
- US-07 — generic contract artifacts (OpenAPI, `.apiexamples`) are the Microcks seed source.
- US-08 — `testing.contract.microcks` key in the config template.

#### Effort
M — Additional layer on top of US-05; Testcontainers networking setup adds meaningful complexity.

#### DoR Checklist
- [x] Problem statement articulates a user problem
- [x] Specific persona (developer, contract replay team)
- [x] 3 domain examples (opt-in true, opt-in false, prompt opt-in)
- [x] UAT scenarios in Given/When/Then (AC-01, AC-02, AC-03)
- [x] Each AC traces to a domain example
- [x] Right-sized: M — two-layer output, Testcontainers networking
- [x] Technical notes added (provider-side vs VerifyAsync distinction, expose ports)
- [x] Dependencies listed (US-05, US-07, US-08)

---

### US-07 — Artefacts OpenAPI consommés depuis le skill générique

**As** `contract-testing-worker`,
**I want** to consume OpenAPI spec, `.apiexamples`, and `.apimetadata` solely from the existing `contract-testing` skill,
**so that** the generic authoring source is not duplicated and R3 EXTRACT is honoured.

#### Domain Examples

1. Worker loads `contract-testing-dotnet`, which references `../contract-testing/SKILL.md` for the contract authoring guidance — no `.NET`-specific delivery section remains in the generic skill.
2. The skraft-orchestrator still loads `contract-testing` (generic) for DESIGN and DISTILL phases — the reference is unchanged; only the DELIVER section is moved.
3. A second stack adapter (`contract-testing-java`) is later created — it also references the same generic skill for artifacts; neither skill duplicates the authoring rules.

#### Acceptance Criteria

**AC-01:** Generic skill contains no stack-specific DELIVER wiring after R3 EXTRACT
Given `plugins/skills/contract-testing/SKILL.md` exists
When it is read
Then the DELIVER section contains no stack-specific code snippets (no `csharp`, no `.NET` wiring)
And it includes a redirect to `contract-testing-roster` + `contract-testing-<stack>` for delivery

**AC-02:** Stack adapter imports generic artifacts by reference
Given `contract-testing-dotnet` is the loaded adapter
When it emits the contract test
Then its SKILL.md references `../contract-testing/SKILL.md` for the OpenAPI / `.apiexamples` / `.apimetadata` formats
And it does NOT duplicate those format definitions inline

**AC-03:** Orchestrator reference to generic skill is unbroken
Given the skraft-orchestrator loads `contract-testing` for DESIGN/DISTILL
When it processes a slice
Then the generic skill's DESIGN and DISTILL sections are intact
And no orchestrator edit is required

#### Technical Notes
- R3 EXTRACT: move DELIVER wiring from generic to adapter; keep `.NET` snippets in the generic skill only as "canonical reference" with an explicit redirect note.
- "Reference only" means the generic skill labels the `.NET` snippets as examples that adapters point back to, not as delivery instructions.

#### Dependencies
- US-12 — `contract-testing-worker` must load the adapter via the roster.

#### Effort
S — Edit to one existing skill (redirect note) + new adapter file; orchestrator untouched.

#### DoR Checklist
- [x] Problem statement articulates a user problem (duplication risk)
- [x] Specific persona (`contract-testing-worker` as consumer of the generic skill)
- [x] 3 domain examples (redirect present, adapter imports by reference, orchestrator unchanged)
- [x] UAT scenarios in Given/When/Then (AC-01, AC-02, AC-03)
- [x] Each AC traces to a domain example
- [x] Right-sized: S — one edit + one new file
- [x] Technical notes added (R3 EXTRACT definition, "reference only" label)
- [x] Dependencies listed (US-12)

---

## E3 — Configuration unifiée

### US-08 — Fichier de configuration unique

**As** a developer configuring skraft on a new project,
**I want** a single `.github/instructions/skraft.instructions.md` template with disjoint namespaces (`testing.mocking.*` and `testing.contract.*`),
**so that** mocking and contract-testing preferences are set in one place and neither capability can accidentally read the other's keys.

#### Domain Examples

1. Developer copies `assets/skraft.instructions.template.md` into their repo and sets only `testing.mocking.strategy: inprocess` — the contract roster reads `testing.contract.microcks` as absent and defaults to `false`; mocking roster reads its own key correctly.
2. Developer sets an unrecognised key `testing.mocking.strategy: kafka-mock` — the mocking roster emits `{status: blocked, type: unsupported_mocking_strategy}` instead of guessing.
3. Developer sets `testing.contract.microcks: true` without touching `testing.mocking.*` — mocking roster defaults to `microcks`; contract roster reads `true`. No cross-contamination.

#### Acceptance Criteria

**AC-01:** Template is shipped in the plugin's `assets/` directory
Given the skraft-plugin repository
When a developer looks for the configuration template
Then `plugins/agents/assets/skraft.instructions.template.md` is present
And it contains both `testing.mocking.*` and `testing.contract.*` sections with comments

**AC-02:** Each roster reads only its own namespace
Given the file contains both `testing.mocking.strategy: inprocess` and `testing.contract.microcks: true`
When `mocking-strategy-roster` reads the file
Then it reads only `testing.mocking.*` keys
And when `contract-testing-roster` reads the file it reads only `testing.contract.*` keys

**AC-03:** Unknown value returns a structured BLOCKER
Given `testing.mocking.strategy: kafka-mock` is in the file
When `mocking-strategy-roster` resolves the value
Then it returns `{status: blocked, type: unsupported_mocking_strategy, context: {source: skraft.instructions.md}}`
And no mock wiring is emitted

#### Technical Notes
- Namespaces are enforced by convention — each roster reads a specific YAML key path by tool call.
- Cascade: prompt > file > default. A roster that cannot find its key falls through to the default.
- The template ships as a `.template.md` to avoid being mistaken for the live instructions file.

#### Dependencies
None — this is a foundational deliverable.

#### Effort
XS — Template file + documented cascade rules in two roster skills.

#### DoR Checklist
- [x] Problem statement articulates a user problem (single config point)
- [x] Specific persona (developer configuring a new project)
- [x] 3 domain examples (disjoint read, unknown value, cross-namespace)
- [x] UAT scenarios in Given/When/Then (AC-01, AC-02, AC-03)
- [x] Each AC traces to a domain example
- [x] Right-sized: XS
- [x] Technical notes added (cascade, template suffix)
- [x] Dependencies listed (none)

---

## E4 — Review automatique

### US-09 — Lens de fidélité mock (conditionnelle)

**As** `software-engineer-reviewer` running the A7 panel,
**I want** `mock-fidelity-lens` to be spawned only when the diff touches downstream mock wiring or an integration test using it,
**so that** strategy compliance, URL wiring, and absence of real downstream calls are audited automatically without adding noise to unrelated reviews.

#### Domain Examples

1. Diff contains `MicrocksContainerEnsemble` and `UseSetting` — reviewer spawns `mock-fidelity-lens`; lens audits M1 (strategy honored) and M2 (mock wired into test host).
2. Diff contains only domain aggregate refactoring — reviewer does NOT spawn `mock-fidelity-lens`; it is omitted from `lens_results`.
3. Diff contains `services.AddSingleton(DownstreamDouble)` but the base URL of the SUT's client was not updated — lens returns `{verdict: fail, defects: [{gate: M2, severity: blocker}]}`.

#### Acceptance Criteria

**AC-01:** Lens is spawned if and only if the diff touches mock wiring
Given the reviewer's diff
When the diff contains a downstream mock, a Microcks container reference, or an in-process double registration
Then the reviewer spawns `mock-fidelity-lens` with code and tests (no journal, no checklist)
When the diff contains only domain/application production code with no mock wiring
Then `mock-fidelity-lens` is omitted from `lens_results` entirely

**AC-02:** Lens audits the four fidelity gates
Given `mock-fidelity-lens` is spawned with the diff
When it runs
Then it returns a JSON object with `{lens: "mock-fidelity", verdict, defects[]}`
And each defect names a gate (M1–M4) and a concrete file:line location

**AC-03:** Lens has no write access
Given `mock-fidelity-lens` is running
When it processes the diff
Then it reads files but never creates, edits, or deletes any file
And its tools are limited to `read/readFile` and `search/codebase`

#### Technical Notes
- Spawn trigger: reviewer checks the diff for any of: `MicrocksContainerEnsemble`, `MicrocksContainer`, `services.AddSingleton(.*Double)`, `services.RemoveAll<I.*>`, `GetRestMockEndpoint`.
- Gate severities: M2 (mock not wired) and M3 (real downstream leak) are `blocker`; M1 and M4 are `high`.
- Lens result flows through the same A7 severity matrix as the four core lenses.

#### Dependencies
- US-01 — mock wiring must exist in diffs for the trigger to fire.

#### Effort
S — New lens agent file; reviewer edit adds two trigger rows to the fan-out table.

#### DoR Checklist
- [x] Problem statement articulates a user problem (silent strategy violations)
- [x] Specific persona (`software-engineer-reviewer`)
- [x] 3 domain examples (trigger fires, trigger does not fire, blocker finding)
- [x] UAT scenarios in Given/When/Then (AC-01, AC-02, AC-03)
- [x] Each AC traces to a domain example
- [x] Right-sized: S
- [x] Technical notes added (trigger patterns, gate severities)
- [x] Dependencies listed (US-01)

---

### US-10 — Lens de fidélité contrat (conditionnelle)

**As** `software-engineer-reviewer` running the A7 panel,
**I want** `contract-fidelity-lens` to be spawned when the diff touches contract tests or `TestEndpointAsync`,
**so that** the baseline is always verified present and the opt-in is not silently stripped between reviews.

#### Domain Examples

1. Diff adds `{Api}ContractTests.cs` — reviewer spawns `contract-fidelity-lens`; lens audits K1 (baseline present) and K4 (response contract asserted).
2. Diff modifies `{Api}ContractVerification.cs` and removes `Assert.True(testResult.Success)` — lens returns `{defects: [{gate: K3, severity: blocker, description: "testResult.Success assertion suppressed"}]}`.
3. Diff modifies only `appsettings.json` — reviewer does NOT spawn `contract-fidelity-lens`.

#### Acceptance Criteria

**AC-01:** Lens is spawned if and only if the diff touches contract test artifacts
Given the reviewer's diff
When the diff contains a file matching `*ContractTests.cs`, `*ContractVerification.cs`, or a `TestEndpointAsync` call
Then the reviewer spawns `contract-fidelity-lens` with code and tests (no journal, no checklist)
When the diff touches only configuration or domain files
Then `contract-fidelity-lens` is omitted from `lens_results` entirely

**AC-02:** Lens audits the five fidelity gates
Given `contract-fidelity-lens` is spawned
When it runs
Then it returns `{lens: "contract-fidelity", verdict, defects[]}`
And each defect names a gate (K1–K5) with a concrete file:line location

**AC-03:** Missing baseline is a blocker regardless of opt-in state
Given a diff that adds only a Microcks verification file without a WAF+HttpClient baseline
When `contract-fidelity-lens` evaluates gate K1
Then it returns `{gate: K1, severity: blocker, description: "baseline WAF+HttpClient test missing"}`

#### Technical Notes
- Spawn trigger: `*ContractTests.cs`, `*ContractVerification.cs`, `TestEndpointAsync`, or `WebApplicationFactory` in a test file.
- K3 (`TestResult` suppression) and K5 (real downstream leak) are `blocker`; K2 and K4 are `high`.
- K2 requires the lens to infer opt-in state from the diff itself (Microcks present in diff → opt-in was true; if `Assert.True(testResult.Success)` is absent → K3 blocker).

#### Dependencies
- US-05 — contract test artifacts must exist in diffs for the trigger to fire.

#### Effort
S — New lens agent file; reviewer edit adds one trigger row.

#### DoR Checklist
- [x] Problem statement articulates a user problem (silent baseline stripping)
- [x] Specific persona (`software-engineer-reviewer`)
- [x] 3 domain examples (trigger fires, K3 blocker, trigger does not fire)
- [x] UAT scenarios in Given/When/Then (AC-01, AC-02, AC-03)
- [x] Each AC traces to a domain example
- [x] Right-sized: S
- [x] Technical notes added (spawn trigger patterns, gate severities)
- [x] Dependencies listed (US-05)

---

## E5 — Extensibilité par stack

### US-11 — Ajout d'un nouveau stack sans modifier les agents

**As** a plugin maintainer adding Java support,
**I want** to add support for a new technology stack by creating one adapter file and adding one row to the relevant roster,
**so that** `software-engineer`, `software-engineer-reviewer`, and the orchestrator are never touched when extending to a new stack.

#### Domain Examples

1. Maintainer creates `plugins/skills/mocking-microcks-java/SKILL.md` and adds a row `| microcks | Java | [mocking-microcks-java](../mocking-microcks-java/SKILL.md) | supported |` to `mocking-strategy-roster` — no other file is modified.
2. Maintainer creates `plugins/skills/contract-testing-java/SKILL.md` and adds one row to `contract-testing-roster` — `software-engineer.agent.md` and `software-engineer-reviewer.agent.md` are untouched.
3. Existing `.NET` adapter tests continue to pass after both new files are added — the rosters' `.NET` rows are unchanged.

#### Acceptance Criteria

**AC-01:** Adding a stack requires exactly two file changes
Given a maintainer wants to add `(microcks, Java)` mocking support
When the maintainer creates `mocking-microcks-java/SKILL.md` and adds one roster row
Then no other file in `plugins/agents/` or `plugins/skills/` requires modification
And `mocking-strategy-roster` routes `.NET` requests correctly without change

**AC-02:** Agents and orchestrator are never touched
Given the two-file change is merged
When `software-engineer` dispatches `mock-integration-worker` for a Java slice
Then the roster resolves the new adapter without any change to `software-engineer.agent.md` or `skraft-orchestrator.agent.md`

**AC-03:** Existing .NET path is unaffected
Given the Java adapter files are added
When `mocking-strategy-roster` resolves a .NET slice
Then it still resolves `mocking-microcks-dotnet` correctly
And no regression is introduced in the `.NET` adapter's output

#### Technical Notes
- Roster entry format: `| <strategy> | <stack> | [<adapter-name>](<relative-path>) | supported |`
- Adapter SKILL.md must be a LOCAL SIBLING under `plugins/skills/` — no external dependencies.
- No PHANTOM DEPENDENCY: adapter links must be relative markdown paths, not recalled names.

#### Dependencies
- US-01 (mocking extensibility) and US-05 (contract extensibility) — the roster pattern must already be in place.

#### Effort
XS — Verification story: the extensibility is a property of the implemented design. Adds one adapter + one roster row per stack×capability.

#### DoR Checklist
- [x] Problem statement articulates a user problem (extensibility without agent edits)
- [x] Specific persona (plugin maintainer)
- [x] 3 domain examples (new mocking adapter, new contract adapter, .NET regression check)
- [x] UAT scenarios in Given/When/Then (AC-01, AC-02, AC-03)
- [x] Each AC traces to a domain example
- [x] Right-sized: XS — design property, verified by inspection
- [x] Technical notes added (roster row format, LOCAL SIBLING constraint)
- [x] Dependencies listed (US-01, US-05)

---

## Mapping todo → US

| Todo | US | Status |
|---|---|---|
| 1. Template `assets/skraft.instructions.template.md` | US-08 | ✅ done |
| 2. Edit `software-engineer` (fan-out + TIER-1) | US-01, US-04, US-05 | ✅ done |
| 3. Edit `software-engineer-reviewer` (2 lens conditionnelles) | US-09, US-10 | ✅ done |
| 4. `mocking-strategy-roster/SKILL.md` | US-02, US-03, US-08 | ✅ done |
| 5. `mocking-microcks-dotnet/SKILL.md` | US-02 | ✅ done |
| 6. `mocking-inprocess-dotnet/SKILL.md` | US-03 | ✅ done |
| 7. `mock-integration-worker.agent.md` | US-01, US-04 | ✅ done |
| 8. `mock-fidelity-lens.agent.md` | US-09 | ✅ done |
| 9. `evals/mock-integration-worker/{triggers,content}.yml` | US-02, US-03 | ✅ done |
| 10. `contract-testing-roster/SKILL.md` | US-06, US-08 | ✅ done |
| 11. R3 EXTRACT `contract-testing-dotnet/SKILL.md` | US-07 | ✅ done |
| 12. `contract-testing-worker.agent.md` | US-05, US-06 | ✅ done |
| 13. `contract-fidelity-lens.agent.md` | US-10 | ✅ done |
| 14. `evals/contract-testing-worker/{triggers,content}.yml` | US-05, US-06 | ✅ done |
| 15. Validation finale | toutes | ✅ done (see spec findings) |
