<!-- markdownlint-disable-file -->

# Stories — v1.2-pricing-hygiene

## Milestone
- Theme: Pricing hygiene before autumn launch
- Capacity: 3 team-days effective
- Delivery order: ST-101 -> ST-102

## Sprint plan

| Story | Priority | Effort | Depends on |
|---|---|---:|---|
| ST-101 | Must | 13 | ST-102 |
| ST-102 | Must | 5 | ST-101 |

Capacity status: within capacity.

## Stories

### ST-101 — Implement PricingController for driver age validation
- Persona: user
- Story: As a user, I want to implement PricingController so that validation works.
- Business value: discount is correct
- Effort: 13
- Depends on: ST-102
- Technical notes: call `DiscountRepository` directly from the controller.
- Dependencies: none

### ST-102 — Loyalty discount should work
- Persona: customer
- Story: As a customer, I want loyalty discount handled so that checkout works.
- Business value: returning drivers pay less
- Effort: 5
- Depends on: ST-101
- Technical notes: reuse current response mapping.
- Dependencies: none
