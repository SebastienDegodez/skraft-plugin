<!-- markdownlint-disable-file -->

# Contracts — loyalty tier

**Date:** 2026-08-13
**Slice:** loyalty tier reaches pricing

## Inbound — CalculatePayableTotal

| Field | Type | Meaning |
|---|---|---|
| `subtotalCents` | integer | Order subtotal before any discount, in whole cents |
| `tier` | string | The member's loyalty tier: `Standard` or `Gold` |

Returns the payable total in whole cents.

## Outbound — LoyaltyTierGateway

| Field | Type | Meaning |
|---|---|---|
| `memberId` | string | The member placing the order |
| `tier` | string | The tier held for that member |

## Failure handling

| Situation | Behaviour |
|---|---|
| Unknown member id | The order is priced as `Standard` |
| Gateway timeout | The order is priced as `Standard`, and a counter is raised |

## Sizing

One call per order. No batching. No caching in this slice.

## Notes

1. Whole cents everywhere; no floating point value crosses either contract.
2. Field names use the member vocabulary already in the lexicon.
3. The tier reaching `CalculatePayableTotal` assumes the tier has already been validated upstream, so this slice specifies no tier check of its own.
