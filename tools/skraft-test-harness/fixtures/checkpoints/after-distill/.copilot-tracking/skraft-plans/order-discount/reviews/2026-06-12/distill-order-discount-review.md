<!-- markdownlint-disable-file -->
# DISTILL Review — order-discount

**Phase:** DISTILL
**Reviewer:** acceptance-designer-reviewer
**Date:** 2026-06-12

## Lenses

| Lens | Verdict | Notes |
|---|---|---|
| Business alignment | PASS | Scenarios map 1:1 to the acceptance criteria. |
| Testability | PASS | Each scenario asserts an observable payable total. |
| Coverage | PASS | Cap, stacking, no-promo, inactive-promo all covered. |
| Discriminating | PASS | The cap scenario fails a naive (un-clamped) implementation. |

## Synthesis

Gherkin scenarios are executable, business-aligned, and include the
discriminating cap case. Ready for DELIVER.

**Verdict: APPROVED**
