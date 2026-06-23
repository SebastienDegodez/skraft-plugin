<!-- markdownlint-disable-file -->
---
adr: 1
title: Result Type Pattern (Ok/Err discriminated union)
status: Accepted
chosen: lightweight Ok/Err POJOs
decision: >
  We will represent operation outcomes with a lightweight Result type — Ok(value)
  and Err(error) as plain objects with an `ok` discriminant — instead of throwing
  exceptions, keeping domain functions pure and dependency-free.
supersedes: null
date: 2026-06-20
ratified_by: Solution Architect (US1) 2026-06-20
---

# ADR-001 — Result Type Pattern (Ok/Err discriminated union)

**Date:** 2026-06-20
**Status:** Accepted
**Deciders:** Solution Architect (US1)

## Context
The framework needs a way to represent operation outcomes without throwing exceptions. Domain functions must be pure and composable.

## Decision
Use a lightweight Result type: `Ok(value)` and `Err(error)` as plain JS objects with a `ok` boolean discriminant. No class hierarchy, no runtime dependencies.

```js
// Ok / Err are plain factory functions returning POJOs
const Ok = (value) => ({ ok: true, value })
const Err = (error) => ({ ok: false, error })
```

## Consequences
- **Positive**: Zero deps, pure functions, easily pattern-matched via `result.ok`
- **Positive**: Compatible with ESM tree-shaking
- **Negative**: No automatic TypeScript narrowing (acceptable — project is plain JS)
- **Invariant**: `domain/result.mjs` has NO imports from ports or adapters

## Alternatives rejected
- neverthrow / fp-ts: would introduce runtime dependencies (AC1 violation)
- Exception-based: harder to compose, loses type information at call sites
