---
name: characterize-with-contracts
description: "Use to make an existing HTTP service safe to change before a refactor: discover or reconstruct its API contract from the code, then write characterization (golden-master) tests that pin its CURRENT behaviour, bugs included, with every downstream dependency mocked. Works for .NET, Java, Python and Node/TypeScript services; reuses the contract-testing and mocking-strategy-roster skills for the test wiring. Activate on 'characterize this API', 'lock in current behavior', 'build a safety net before refactoring', 'golden master tests for this service'."
---

# Characterize With Contracts

TDD tests state what the code should do; characterization tests state what it does now, so a
refactor can prove it changed nothing. A bug captured here is documented behaviour, not a test to
make pass differently.

**Boundary.** Never fix a bug you find, never touch service code to make a test pass, never write
test or mock wiring of your own invention: take it from the skills named below.

## 1. Resolve the component

- `skraft-config.json` at the repository root: take the component's `root`, `stack`, `paths`,
  `commands` (`build`, `test`) and `mocking`. A command written there always wins.
- No configuration: detect the stack from the manifest (`*.csproj`, `pom.xml`/`build.gradle`,
  `pyproject.toml`, `package.json`) and use the project's own build and test commands; record that
  they were detected, not configured.

## 2. Establish the contract (fact first)

1. Search for an existing OpenAPI or AsyncAPI document, or a framework spec route. Found: it is the
   base contract.
2. None: generate it with the framework's own tooling and the service as it is — Swashbuckle/NSwag
   (`dotnet swagger tofile`), springdoc (`/v3/api-docs`), FastAPI (`/openapi.json`), NestJS Swagger
   or the equivalent. A generated contract is a fact.
3. No tooling: reconstruct it from the routes and request/response types the code exposes, never
   from what it should expose, and tag each reconstructed operation `confidence: Medium` or `Low`.

Commit the contract under the component's test paths.

## 3. Resolve the test wiring (by skill name)

1. Load `contract-testing` and follow its stack table to the component's `contract-testing-<stack>`
   skill for the in-process HTTP test host. A stack with no such skill: use the framework's standard
   in-process host (`WebApplicationFactory`, `@SpringBootTest` with a test client, FastAPI
   `TestClient`, `supertest`) and say so in the report.
2. For every downstream call, load `mocking-strategy-roster`: the component's `mocking` setting
   decides the strategy (Microcks or in-process), the roster names the recipe skill.
3. A skill reported missing means the skraft plugin is not installed next to this one: report
   `[SKILL MISSING] <name>` and stop.

## 4. Write the golden master

One test per contract operation and response family the service produces, calling it through the
resolved host and asserting the current status code, headers that matter, body shape and, where
deterministic, values. Behaviour that looks wrong is asserted as it is, with
`CHARACTERIZATION: current behaviour may be unintended — <what and why>` in a comment. Never skip an
operation: an untested path is a hole in the safety net.

## 5. Green-before-refactor gate

Run the component's `test` command against the unmodified service:

- **PASS**: all green, every contract operation has a characterization test.
- **CONCERNS**: all green with gaps (low-confidence operations, a dependency that could not be
  mocked cleanly); name each gap.
- **FAIL**: a test fails against unmodified code, or no contract could be established. A red
  characterization test means the harness is wrong: fix the harness, never the service.

## Report

Contract origin (found at `<path>` / generated / reconstructed), operations covered, the test
command run and its result, verdict, each gap or suspected bug with its location.
