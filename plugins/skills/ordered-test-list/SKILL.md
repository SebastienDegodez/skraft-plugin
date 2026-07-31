---
name: ordered-test-list
description: Use when executing DELIVER with strict incremental TDD; enforce ordered one-test-at-a-time progression with TPP and FLFI checkpoints before any production edit.
---

# ordered-test-list

## Overview

Execution guard for strict incremental TDD in DELIVER.
One test at a time, one failure at a time, one production delta at a time.

## Core Objective

Prevent batch-style implementation by forcing a deterministic sequence:

1. Select the next test in an explicit ordered list
2. Confirm RED on that test
3. Apply the smallest production change
4. Confirm GREEN for the selected test
5. Re-run regression suite
6. Move to next test

No skipping. No parallel test progression.

## TPP + FLFI Rules

### TPP — Test Progression Principle

Advance test set using smallest possible step.
Prefer progression that increases certainty with minimum design commitment.

Progression order:
1. Constant case
2. Obvious second example (triangulation)
3. Boundary and edge variants
4. Error paths
5. Refactoring safety nets

If two tests are possible, take simpler/earlier one.

### FLFI — First-Loss, First-Insight

Always treat first failing test as active work item.
Do not fix second failure while first failure still RED.

If full suite shows multiple failures:
- Pick first failure in ordered list
- Ignore downstream failures until first one is GREEN
- Re-run and repeat

## Ordered Test List Contract

Before coding, declare ordered list:

```
1) <test-id>
2) <test-id>
3) <test-id>
...
```

Rules:
- Stable order for current slice
- Exactly one active test at a time
- Mark each test status: `pending | red | green`
- Never mark green without execution proof

## Mandatory Cycle (per test)

1. **Select** next `pending` test
2. **Run single test** -> must be RED on behavior/assertion
3. **Implement minimal code** for this test only
4. **Run single test** -> must be GREEN
5. **Run nearby regression** (suite/module)
6. **Update ordered list** (`green`, move cursor)

Stop conditions:
- If RED is compile/setup-only, fix stubs then re-run until behavior RED
- If implementation touches behavior outside active test, revert and split step

## Forbidden Moves

- Implementing for multiple pending tests in one edit
- Jumping to another failing test before current one is GREEN
- Reordering list to hide failure
- Editing tests to bypass RED evidence
- Committing with `pending` or `red` tests in active slice

## Integration

- Run with [outside-in-tdd](../outside-in-tdd/SKILL.md) as global strategy
- Run with [red-synthesize-green](../red-synthesize-green/SKILL.md) for RED/GREEN mechanics
- Run with [craft-discipline](../craft-discipline/SKILL.md) for test-theater and discipline gates
