<!-- markdownlint-disable-file -->
# Change Log — US1 — Fondation Clean Architecture — 2026-06-20

## Summary
Implements the hexagonal Clean Architecture skeleton for the SKRAFT framework.
All source files and tests live under `skraft-framework/`.

## Files Created

### skraft-framework/domain/
- `result.mjs` — Ok/Err discriminated union, isOk, isErr
- `error-codes.mjs` — domain error code constants (7 constants)
- `value-objects.mjs` — Phase, AgentName, ProjectSlug, Verdict, SkillRef
- `specifications.mjs` — andSpec, orSpec, notSpec combinators

### skraft-framework/ports/driven/
- `audit-writer.mjs`, `state-reader.mjs`, `filesystem.mjs`, `time-provider.mjs`
- `config.mjs`, `transcript-reader.mjs`, `commit-verifier.mjs`

### skraft-framework/ports/driver/
- `pre-tool-use-port.mjs`, `subagent-stop-port.mjs`

### skraft-framework/adapters/driven/
- `null-audit-writer.mjs` — no-op for tests
- `jsonl-audit-writer.mjs` — append-only JSONL (AC3)
- `json-state-reader.mjs` — read/write state.json
- `system-time.mjs`, `fixed-time.mjs` — real and deterministic time
- `real-filesystem.mjs`, `in-memory-filesystem.mjs` — real and test filesystem

### skraft-framework/adapters/drivers/hooks/
- `payload.mjs` — normalises camelCase/PascalCase/snake_case to camelCase (AC4)
- `decision.mjs` — allow/deny/block/additionalContext helpers
- `hook-entry.mjs` — normalises and routes incoming hook payloads
- `hook-router.mjs` — routes by hook type to registered handlers
- `service-factory.mjs` — wires router + entry into a runnable service

### skraft-framework/application/
- `config-loader.mjs` — cascade: project-local > global > env (built-ins only)

### skraft-framework/tests/
- `ac2-domain-purity.test.mjs` — architecture gate (AC2)
- `ac3-audit-writer.test.mjs` — JSONL + null writer behavior (AC3)
- `ac4-payload.test.mjs` — payload normalisation behavior (AC4)
- `config-loader.test.mjs` — config cascade behavior
- `hook-service.test.mjs` — hook routing end-to-end (outside-in)

## Test Results
`node --test skraft-framework/tests/*.test.mjs` → 18 tests, 0 failing ✅

## Acceptance Criteria
- [x] AC1: node --test passes, zero runtime deps
- [x] AC2: domain/ has no hook protocol imports
- [x] AC3: JSONL append-only + null-audit-writer
- [x] AC4: payload.mjs normalises 3 formats
