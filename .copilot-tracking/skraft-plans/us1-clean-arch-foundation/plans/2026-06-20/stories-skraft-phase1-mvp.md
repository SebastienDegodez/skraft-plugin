<!-- markdownlint-disable-file -->
# Stories — skraft-framework Phase 1 — MVP

**Milestone:** skraft-framework Phase 1 — MVP
**Theme:** Fondation hexagonale Clean Architecture
**Scope:** Issue #47

## Sprint Plan

| Story | Priority | Effort | MoSCoW | Dependencies |
|---|---|---|---|---|
| US1 — Fondation Clean Architecture | P1 | M | Must | — |

Capacity: 5 team-days (effective 3.5) | Total effort: M (3j) | Status: within capacity

## Story: US1 — Fondation Clean Architecture (squelette hexagonal)

**ID:** US1
**Issue:** #47
**Persona:** Mainteneur du framework SKRAFT
**Story statement:** En tant que mainteneur du framework, je veux un socle hexagonal (domain pur → application → ports → adapters) avec Result type et audit JSONL, afin de construire des garde-fous testables boundary-to-boundary, sans dépendance.

**Effort:** M (3 team-days)
**MoSCoW:** Must
**Dependencies:** none

**DoR Status:** ✅ READY
1. ✅ Problem statement (framework needs testable hexagonal foundation)
2. ✅ Specific persona (framework maintainer)
3. ✅ Domain examples: Ok/Err discriminated union, JSONL append, camelCase/snake_case normalisation
4. ✅ UAT scenarios: node --test suite runs green
5. ✅ AC derived from UAT
6. ✅ Right-sized (M = 3 team-days)
7. ✅ Technical notes: .mjs, node --test, zero runtime deps
8. ✅ Dependencies: none
