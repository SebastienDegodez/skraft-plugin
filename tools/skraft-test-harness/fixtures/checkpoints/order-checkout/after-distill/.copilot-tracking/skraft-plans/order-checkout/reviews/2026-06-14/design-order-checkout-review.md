<!-- markdownlint-disable-file -->
# DESIGN Review — order-checkout

**Phase:** DESIGN
**Reviewer:** solution-architect-reviewer
**Date:** 2026-06-14

## Lenses

| Lens | Verdict | Notes |
|---|---|---|
| Clean Architecture | PASS | Discount rule in the Domain; API only maps the 404. |
| DDD tactical | PASS | `Order` aggregate, `Money` value object, repository gateway. |
| Contract fitness | PASS | Checkout contract covers 200 + 404 ProblemDetails. |
| Decision record | PASS | ADR-001 captures the placement rationale. |

## Synthesis

Design keeps the discount rule in the Domain and is testable without IO.

**Verdict: APPROVED**
