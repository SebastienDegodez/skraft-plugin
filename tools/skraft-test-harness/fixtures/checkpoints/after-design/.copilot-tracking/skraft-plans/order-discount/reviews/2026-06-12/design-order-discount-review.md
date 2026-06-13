<!-- markdownlint-disable-file -->
# DESIGN Review — order-discount

**Phase:** DESIGN
**Reviewer:** solution-architect-reviewer
**Date:** 2026-06-12

## Lenses

| Lens | Verdict | Notes |
|---|---|---|
| Clean Architecture | PASS | Rule stays in Domain; API only forwards parameters. |
| DDD tactical | PASS | Promotion is a value object; DiscountPolicy is a domain service. |
| Contract fitness | PASS | Backward-compatible overload; no caller breakage. |
| Decision record | PASS | ADR-001 captures combination + cap rationale. |

## Synthesis

Design keeps the discount rule in the domain and is backward compatible. Cap is
explicit and testable.

**Verdict: APPROVED**
