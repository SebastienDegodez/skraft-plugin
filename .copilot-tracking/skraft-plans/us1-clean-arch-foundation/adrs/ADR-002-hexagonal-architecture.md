<!-- markdownlint-disable-file -->
# ADR-002 — Hexagonal Architecture (Ports & Adapters)

**Date:** 2026-06-20
**Status:** Accepted
**Deciders:** Solution Architect (US1)

## Context
Framework needs a testable, dependency-inverted structure. The domain must be isolated from infrastructure (filesystem, time, GitHub API).

## Decision
Adopt a strict hexagonal (ports & adapters) layout:
```
domain/        ← pure business logic, zero imports from outside domain/
application/   ← use cases, imports domain + ports
ports/
  driver/      ← inbound port contracts (PreToolUsePort, SubagentStopPort)
  driven/      ← outbound port contracts (AuditWriter, StateReader, …)
adapters/
  driven/      ← driven adapter implementations
  drivers/
    hooks/     ← Claude hook entry points (hook-entry, hook-router, payload, decision, service-factory)
```
Dependency rule: `domain/ → nothing`, `application/ → domain/ + ports/driven/`, `adapters/ → application/ + ports/`.
`domain/` MUST NOT import anything from `adapters/drivers/hooks/` or `ports/driver/`.

## Consequences
- **Positive**: Domain is independently testable
- **Positive**: Infrastructure can be swapped (real vs. in-memory, system-time vs. fixed-time)
- **Invariant**: AC2 — no hook protocol imports in domain/
