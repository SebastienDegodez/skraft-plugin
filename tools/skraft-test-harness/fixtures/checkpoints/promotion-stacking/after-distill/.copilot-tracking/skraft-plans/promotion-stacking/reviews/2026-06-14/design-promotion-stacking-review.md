<!-- markdownlint-disable-file -->
# DESIGN Review — promotion-stacking

**Phase:** DESIGN
**Reviewer:** solution-architect-reviewer
**Date:** 2026-06-14

## Lenses

| Lens | Verdict | Notes |
|---|---|---|
| Clean Architecture | PASS | Combination rule in Domain; downstream isolated behind a gateway. |
| DDD tactical | PASS | `Promotion` value object; `DiscountPolicy` domain service. |
| Contract fitness | PASS | Backward-compatible overload; both Microcks contracts named. |
| Decision record | PASS | ADR-001 captures combination, cap, and dual Microcks usage. |

## Synthesis

Design keeps the rule in the Domain, isolates the external dependency, and makes
both Microcks usages explicit.

**Verdict: APPROVED**
