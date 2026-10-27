---
name: characterize-brownfield
description: "Use to reverse-engineer an existing or legacy codebase with no docs into confidence-scored characterization artifacts (stack, feature inventory, integration map, existing API contracts, test-coverage traceability, risk-scored tech debt), and to compose from them a structured PRD under docs/prds/ that backlog tooling can consume. Activate on 'characterize this codebase', 'what does this system do', 'map the architecture', 'find existing contracts', 'assess tech debt', 'reverse-engineer this legacy system', 'write a PRD from the code'."
---

# Characterize Brownfield

Turn an existing codebase into structured artifacts where every claim is either a **FACT** (read
from a tool call) or an **INFERENCE** with a confidence: **High** (directly observed, e.g. a parsed
OpenAPI file), **Medium** (strong signals, e.g. route patterns plus naming), **Low** (weak or absent
evidence). A claim you cannot back is written as unknown, never as certain.

**Boundary.** Read-only: never edit code, configuration or tests. Never create issues or stories.

## Inputs

- Repository path (required).
- Depth: `quick` (layout and manifests only, no source reads), `deep` (entry points and critical
  directories, **default**), `exhaustive` (all source; warn the human of the cost and get a yes first).
- Focus directories (optional): narrow a deep or exhaustive scan.

## Procedure

### 1. Structure and stack (FACT)

- List the top three directory levels with your file tools.
- Read the manifests present (`package.json`, `*.csproj`/`*.sln`, `pyproject.toml`/`requirements.txt`,
  `pom.xml`/`build.gradle`, `go.mod`, `Cargo.toml`) and record exact frameworks and versions.
- Read the configuration present: compiler settings, lint configuration, CI workflows,
  `skraft-config.json` when the repository has one.
- `git log --since="90 days ago" --name-only --pretty=format:` to find the active areas.

### 2. Feature inventory (INFERENCE)

Deep and exhaustive: read the entry points (controllers, route files, CLI commands, message
handlers) and fill:

| Feature | Evidence | Confidence | Category |
|---|---|---|---|
| {name} | {file:line or pattern} | High/Medium/Low | Core / Secondary / Legacy-unused |

Legacy-unused: present in code, no recent git activity, no inbound reference found. Flag it; never
call it dead.

### 3. Integration and dependency map

Outbound calls (HTTP clients, database connections, queues, third-party SDKs) found by searching for
client construction, connection strings and configuration keys (key names only; never read a secret
value). One row per target: system, protocol, confidence.

### 4. Existing API contracts (optional facet)

Search for OpenAPI, Swagger, AsyncAPI or Pact files and for framework-generated spec routes
(Swashbuckle/NSwag, springdoc, FastAPI `/openapi.json`, NestJS Swagger). Summarize: endpoints,
methods, schema names. None found: record `contracts: none-found` and go on.

### 5. Coverage traceability (optional facet)

For each feature, find the tests that reference it (name, route, class) and classify **FULL** (a
test asserts the behaviour), **PARTIAL** (exercised without asserting it) or **NONE**. Never claim
FULL without reading the assertion. With no test at all, describe what the code currently does from
the implementation and tag it Low.

### 6. Risk scoring (3x3)

Each gap (missing tests, undocumented integration, outdated dependency, NONE coverage on a Core
feature) gets probability × impact, 1-3 each: **9 → P0** (BLOCK, escalate), **6-8 → P1**
(MITIGATE), **4-5 → P2** (MONITOR), **1-3 → P3** (DOCUMENT).

### 7. Confidence gate (before writing)

From the share of High/Medium/Low inferences and the coverage summary:

- **PASS**: mostly High, no Core feature at NONE with a P0/P1 risk.
- **CONCERNS**: a meaningful Medium/Low share, or NONE coverage on a P1+ risk item.
- **FAIL**: mostly Low, or the stack or entry points unresolved.

CONCERNS or FAIL: build a validation checklist (every Low claim, every Core feature at NONE).

- CONCERNS, and the human asked, in this conversation, for a PRD or requirements document to be
  written: write it now, then show the checklist, unless your agent instructions say to wait.
- Otherwise: show the checklist and wait for them to confirm or correct it before any PRD.

## Outputs

Under `.copilot-tracking/skraft-plans/{projectSlug}/characterization/{YYYY-MM-DD}/`, each file
starting with `<!-- markdownlint-disable-file -->`, each claim tagged inline
(`(confidence: Medium — inferred from route naming)`):

- `index.md`: summary, confidence distribution, coverage summary, gate verdict.
- `structure.md`, `features.md`, `integration.md`, `contracts.md` (or `none-found`), `coverage.md`,
  `tech-debt.md`.

## Composing the PRD

When a PRD is asked for, re-read the artifacts from disk and follow
[references/compose-prd.md](references/compose-prd.md).
