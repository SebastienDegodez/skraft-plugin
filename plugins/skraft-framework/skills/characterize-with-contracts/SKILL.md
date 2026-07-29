---
name: characterize-with-contracts
description: "Use to discover or reconstruct a service's API contract and produce characterization (golden-master) tests that lock in its CURRENT behavior — including existing bugs — as a safety net before refactoring a brownfield service. Delegates stack detection and Microcks wiring to contract-testing-roster and mocking-strategy-roster; adds nothing new to the toolchain, only the characterization intent. Activate on 'characterize this API', 'lock in current behavior', 'build a contract-based safety net'."
---

# Characterize With Contracts

Uses the SAME roster/adapter machinery `contract-testing-roster` and `mocking-strategy-roster`
already resolve for DELIVER-phase TDD — but with the opposite intent. TDD tests encode what the
code SHOULD do and change as requirements evolve. Characterization tests encode what the code
ACTUALLY does, right now, on purpose, so a refactor can be verified not to change behavior. A bug
captured here is a documented bug, not a failing test to fix.

**Boundary.** Never "fixes" a bug found during characterization — that is a decision for later,
made deliberately, not accidentally introduced by a refactor. Never re-derives stack/Microcks
wiring — always delegates to the roster skills.

## Procedure

### 1. Establish the contract (FACT-first, S7)

- Search for an existing OpenAPI/AsyncAPI spec (`*.yaml`/`*.json` matching `openapi:`/`asyncapi:`)
  or a Swashbuckle/NSwag-generated spec route. If found, use it as the base contract.
- If none found: **reconstruct** — enumerate controllers/minimal-API routes, read request/response
  DTOs, and generate a contract from what the code actually exposes (never from what it "should"
  expose). Prefer generating the spec via the framework's own tooling (`dotnet swagger tofile` or
  equivalent) over hand-transcribing routes — a tool-generated contract is a fact, a hand-typed one
  is an inference.

### 2. Resolve the harness (delegate, do not reinvent)

1. Load `contract-testing-roster` to resolve the stack adapter (currently `.NET` supported —
   `contract-testing-dotnet`) and read the baseline WebApplicationFactory + HttpClient recipe.
2. Load `mocking-strategy-roster` to resolve the mocking strategy (`microcks` default) and its
   adapter (`mocking-microcks-dotnet`) for any downstream dependency the service under
   characterization calls out to.
3. Follow both adapters' recipes exactly — this skill adds no new wiring vocabulary.

### 3. Write characterization tests (the golden master)

For each contract endpoint: write a test that calls it through the resolved harness and asserts
the CURRENT response exactly (status code, shape, and — where the contract permits — value).
Where behavior looks like a bug: **write the test asserting the buggy behavior**, and add a
`// CHARACTERIZATION: current behavior may be unintended — see <note>` comment. Do not file an
issue, do not fix it, do not skip it — an untested path is a hole in the safety net, not a
cleanup opportunity.

### 4. Green-before-refactor gate (S4 — non-negotiable)

Run the full characterization suite against the UNMODIFIED code. Verdict:

- **PASS** — full suite green, every discovered contract endpoint has a characterization test.
- **CONCERNS** — suite green but coverage gaps exist (some endpoints reconstructed with low
  confidence, or a downstream dependency could not be mocked cleanly).
- **FAIL** — suite does not pass against unmodified code, or the contract itself could not be
  established.

**FAIL or CONCERNS with a Core endpoint uncovered:** stop and report to the human — fix the
harness, never touch the service code to make the harness pass. A red characterization test
before any refactor means the harness is wrong, not the code.

## Output

- Contract file(s) (discovered or reconstructed), committed under the service's test project.
- Characterization test project/files, following the resolved adapter's project conventions.
- Gate verdict report: endpoints covered, verdict, any CONCERNS items with cause.

Report the verdict to the invoking agent (`brownfield-harness-builder`) or, if run standalone,
directly to the human.
