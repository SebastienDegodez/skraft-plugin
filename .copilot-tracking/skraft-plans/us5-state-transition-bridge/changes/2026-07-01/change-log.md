<!-- markdownlint-disable-file -->
# Change Log — us5-state-transition-bridge · 2026-07-01

## DELIVER phase — State Transition Bridge (issue #60)

| Commit | Hash | Description |
|---|---|---|
| feat(domain): export nextPhaseAfter from pipeline-policy (step 1) | 4d89191 | Export private const as named export |
| feat(domain): add validatePipelineState with backward-compat coercion (step 2) | 3949bbe | New function with coercion for missing fields (AC12) |
| feat(domain): implement applyTransition state machine with invariants I1-I8 (step 3) | 69aa71c | New domain/state-machine.mjs — pure, no IO |
| feat(infrastructure): add StateWriter port and atomic json-state-writer (steps 4-5) | c9b769d | PORT + cross-platform atomic write with backup rotation |
| refactor(infrastructure): remove write() from json-state-reader, add corruption detection (step 6) | ada4848 | Breaking change + CORRUPTED_STATE snapshotting |
| feat(application): implement createStateService with init/applyEvent/get use cases (step 7) | d21b73c | Application layer use cases over injected ports |
| feat(cli): add state.mjs CLI with 8 subcommands; append state-machine/service/writer to Stryker (steps 8-9) | cb05e35 | Composition root, exit codes 0/1/2/3 |
| test(domain/application): inner-loop unit tests for state-machine, state-schema, state-service, json-state-writer — mutation score 86.53% | 393aefc | TDD inner loop — 345 tests total |

## Summary

- **345 tests** pass (266 acceptance + 79 new unit tests)
- **Mutation score: 86.53%** (> 80% break threshold)
- `state-machine.mjs`: 96.77% — 4 equivalent mutants (optional chaining on validated state, reason-string variants)
- `state-service.mjs`: 97.75% — 2 equivalent mutants (validation bypass leads to same INVALID_STATE path)
- `json-state-writer.mjs`: 44.90% — 12 no-coverage (EXDEV/finally error injection paths), 15 equivalent mutants (tmpCreated boolean tracking, regex anchors, encoding string)
