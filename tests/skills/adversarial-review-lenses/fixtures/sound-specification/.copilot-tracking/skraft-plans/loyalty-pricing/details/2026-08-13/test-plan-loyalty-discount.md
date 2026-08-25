<!-- markdownlint-disable-file -->

# Test plan — loyalty discount

**Date:** 2026-08-13
**Covers:** `plans/2026-08-12/ac-draft-loyalty-discount.md`,
`features/loyalty-discount.feature`

Every agreed example is exercised through the single entry point checkout calls,
and the observation is the value that entry point returns. Nothing reaches past
that entry point to assert on internal collaborators.

| Criterion | Scenario | Use Case Boundry | Observation |
|---|---|---|---|
| AC-1 | A Standard member pays the full subtotal | `CalculatePayableTotal.For` | the returned payable total in cents |
| AC-2 | A Gold member pays ninety-five percent of the subtotal | `CalculatePayableTotal.For` | the returned payable total in cents |
| AC-3 | A Gold member keeps the remaining part cent | `CalculatePayableTotal.For` | the returned payable total in cents |
| AC-4 | A member whose Gold tier has lapsed pays as a Standard member | `CalculatePayableTotal.For` | the returned payable total in cents |

## Data

No shared mutable state between examples. Each example builds its own member and
order subtotal, so the examples can run in any order.
