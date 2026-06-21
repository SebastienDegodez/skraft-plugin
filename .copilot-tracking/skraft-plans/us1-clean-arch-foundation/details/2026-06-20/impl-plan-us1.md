<!-- markdownlint-disable-file -->
# Implementation Plan — US1 — Fondation Clean Architecture

**Depth tier:** comprehensive | **Difficulty:** medium
**TDD variant:** Outside-In TDD with node --test (no framework)
**Language:** Node.js ESM (.mjs), zero runtime dependencies
**Root:** `skraft-framework/`

## Source Layout

```
skraft-framework/
  domain/
    result.mjs          — Ok/Err discriminated union
    error-codes.mjs     — domain error code constants
    value-objects.mjs   — Phase, AgentName, ProjectSlug, Verdict, SkillRef
    specifications.mjs  — andSpec / orSpec / notSpec combinators
  ports/
    driven/             — outbound port contracts (JSDoc duck-typing)
    driver/             — inbound port contracts (JSDoc duck-typing)
  adapters/
    driven/             — jsonl-audit-writer, null-audit-writer, json-state-reader, system-time, fixed-time, real-filesystem, in-memory-filesystem
    drivers/hooks/      — payload, decision, hook-entry, hook-router, service-factory
  application/
    config-loader.mjs   — cascade project-local > global > env
  tests/
    ac1-suite.test.mjs         — suite runs, zero runtime deps
    ac2-domain-purity.test.mjs — architecture gate: domain/ has no hook imports
    ac3-audit-writer.test.mjs  — JSONL append-only + null variant behavior
    ac4-payload.test.mjs       — payload normalise() behavior (camel/Pascal/snake)
    config-loader.test.mjs     — config cascade behavior
    hook-service.test.mjs      — hook routing behavior (end-to-end)
```

## Outside-In Order (Walking Skeleton)

### Step 1 — RED: Write acceptance tests for all ACs
- `tests/ac2-domain-purity.test.mjs` → fails (domain/ empty)
- `tests/ac3-audit-writer.test.mjs` → fails (adapter missing)
- `tests/ac4-payload.test.mjs` → fails (payload missing)
- `tests/config-loader.test.mjs` → fails (config-loader missing)
- `tests/hook-service.test.mjs` → fails (hook service missing)

### Step 2 — GREEN: Implement domain/
- `domain/result.mjs` — Ok, Err, isOk, isErr
- `domain/error-codes.mjs` — constants
- `domain/value-objects.mjs` — Phase, AgentName, ProjectSlug, Verdict, SkillRef
- `domain/specifications.mjs` — andSpec, orSpec, notSpec

### Step 3 — GREEN: Implement ports/ (duck-typing contracts, no tests)
- `ports/driven/` — 7 outbound port stubs
- `ports/driver/` — 2 inbound port stubs

### Step 4 — GREEN: Implement adapters/
- `adapters/driven/null-audit-writer.mjs` + `jsonl-audit-writer.mjs` → AC3 green
- `adapters/driven/json-state-reader.mjs`, `system-time.mjs`, `fixed-time.mjs`
- `adapters/driven/real-filesystem.mjs`, `in-memory-filesystem.mjs`
- `adapters/drivers/hooks/payload.mjs` → AC4 green
- `adapters/drivers/hooks/decision.mjs`, `hook-entry.mjs`, `hook-router.mjs`, `service-factory.mjs`

### Step 5 — GREEN: Implement application/
- `application/config-loader.mjs` → config cascade green

### Step 6 — VERIFY
- `node --test skraft-framework/tests/` → all green, 0 failing → AC1 ✅
- `package.json` has no `dependencies` → AC1 ✅

## Quality Gates
- `node --test skraft-framework/tests/` → 0 failing
- No runtime dependencies in package.json
- AC2 domain purity architecture test passes
