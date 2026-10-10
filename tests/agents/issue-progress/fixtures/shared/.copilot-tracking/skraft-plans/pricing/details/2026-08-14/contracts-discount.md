<!-- markdownlint-disable-file -->
# Contracts — discount

## POST /checkout/price

Request: `{ "customerId": "c-17", "subtotalCents": 10000 }`

Response 200: `{ "tier": "Silver", "chargedCents": 9000, "reductionCents": 1000 }`

Amounts are integer cents (ADR-001). Unknown customers are priced as Bronze.
