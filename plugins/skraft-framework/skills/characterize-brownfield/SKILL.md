---
name: characterize-brownfield
description: "Use to reverse-engineer an existing/brownfield codebase into structured, confidence-scored characterization artifacts (tech stack, feature inventory, dependency & integration map, existing API contracts, test-coverage traceability, tech debt & risks). Use before composing a PRD, or standalone to understand a legacy system with no docs. Activate on 'characterize this codebase', 'what does this system do', 'map the architecture', 'find existing contracts', 'assess tech debt', 'reverse-engineer this legacy system'."
---

# Characterize Brownfield

Reverse-engineers an existing codebase into structured, confidence-scored artifacts. Every
claim is either a FACT (from a tool call — S7) or an INFERENCE (LLM interpretation), and every
inference carries a confidence: **High** (directly observed, e.g. a parsed OpenAPI file) /
**Medium** (inferred from strong signals, e.g. route patterns + naming conventions) / **Low**
(guessed from weak or absent evidence). Honesty about confidence is the point — a brownfield
PRD built on fabricated certainty is worse than one that says "unknown."

**Boundary.** Read-only. Never edits code. Does not write a PRD (see `compose-brownfield-prd`).
Does not create issues or stories.

## Inputs

- Repository path (required).
- Depth: `quick` (2-5 min, pattern-based, no source reads) / `deep` (10-30 min, critical dirs —
  **default**) / `exhaustive` (30-120 min, all source, opt-in only — warn the user of cost first).
- Focus directories (optional) — narrows deep/exhaustive scans.

## Procedure

### 1. Structure & stack (FACT, via tool calls — S7 only, never recall)

- `find . -maxdepth 3 -type d` (or workspace tools) for top-level layout.
- Read manifest files present: `package.json`, `*.csproj`/`*.sln`, `requirements.txt`/`pyproject.toml`,
  `pom.xml`/`build.gradle`, `go.mod`, `Cargo.toml`. Extract exact framework + versions — never guess.
- Read config files present: `tsconfig.json`, `.editorconfig`, lint configs, CI workflow files.
- `git log --since="90 days ago" --name-only --pretty=format:` to find active areas (recent
  churn correlates with what still matters).

### 2. Feature inventory (INFERENCE, confidence-scored)

For deep/exhaustive: read entry points (controllers, route files, CLI commands, message
handlers). Group into a feature table:

| Feature | Evidence | Confidence | Category |
|---|---|---|---|
| {name} | {file:line or pattern} | High/Med/Low | Core / Secondary / Legacy-unused |

"Legacy-unused" = present in code but no recent git activity and no inbound references found —
flag, do not delete, do not assume dead.

### 3. Integration & dependency map (FACT where possible)

List outbound calls (HTTP clients, DB connections, message queues, third-party SDKs) found via
grep for client instantiation patterns, connection strings, `appsettings*`/`.env*` keys (names
only — never read secret values). Each entry: target system, protocol, confidence.

### 4. Existing API contracts (opt-in facet, graceful degradation)

Search for OpenAPI/Swagger/AsyncAPI/Pact files (`*.yaml`/`*.json` matching `openapi:`/`swagger:`/
`asyncapi:`, `pacts/*.json`) and framework-generated specs (Swashbuckle/NSwag output routes,
`springdoc`, FastAPI `/openapi.json` route). Light-weight v1: **discover + summarize** (endpoint
list, methods, request/response schema names) — not full schema validation. If none found,
record `contracts: none-found` and move on; this is optional, never a blocker.

### 5. Coverage traceability (opt-in facet)

For each feature in the inventory, check test coverage: search for test files referencing the
feature (by name, route, or class). Classify **FULL** (direct test asserting the behavior) /
**PARTIAL** (indirect coverage, e.g. integration test exercises the path but doesn't assert the
specific behavior) / **NONE**. When zero tests exist for a feature, use a **synthetic oracle**:
infer expected behavior from the code itself (read the implementation, describe what it
currently does) and mark confidence Low — this still gives downstream steps something concrete
instead of a blank. Never claim FULL coverage without reading an actual assertion.

### 6. Risk scoring (3x3 model)

For each tech-debt item or gap found (missing tests, undocumented integration, outdated
dependency, `NONE` coverage on a Core feature): score **probability x impact = 1-9**
(1-3 each axis). Map: **9 -> P0** (auto-flag BLOCK), **6-8 -> P1**, **4-5 -> P2**, **1-3 -> P3**.
Action per band: P0 = BLOCK (escalate), P1 = MITIGATE, P2 = MONITOR, P3 = DOCUMENT.

### 7. Confidence gate (S4 — before writing artifacts)

Compute an overall confidence distribution (% High / Med / Low across all inferences) and a
coverage summary (% features with FULL/PARTIAL/NONE traceability). Verdict:

- **PASS** — majority High confidence, no Core feature at NONE coverage with P0/P1 risk.
- **CONCERNS** — meaningful Medium/Low share, or NONE coverage on a P1+ risk item.
- **FAIL** — majority Low confidence or critical structure (stack/entry points) unresolved.

CONCERNS or FAIL: surface an explicit validation checklist to the human (list every Low-confidence
claim and every NONE-coverage Core feature) before proceeding. This is a quality checkpoint, not a
security gate — the human confirms or corrects, then work continues.

## Outputs

Written under `.copilot-tracking/skraft-plans/{projectSlug}/characterization/{YYYY-MM-DD}/`
(use the exact output path declared by the calling agent; this workflow is
standalone and does not claim a pipeline phase row):

- `index.md` — summary, confidence distribution, coverage summary, gate verdict.
- `structure.md` — stack, versions, layout (FACT).
- `features.md` — feature inventory table.
- `integration.md` — dependency/integration map.
- `contracts.md` — discovered API contracts (or `none-found`).
- `coverage.md` — traceability table (FULL/PARTIAL/NONE per feature).
- `tech-debt.md` — risk-scored gaps (3x3 table).

Every file starts with `<!-- markdownlint-disable-file -->`. Every claim in every file carries
its confidence tag inline, e.g. `(confidence: Medium — inferred from route naming)`.
