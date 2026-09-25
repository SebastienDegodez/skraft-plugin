<!-- markdownlint-disable-file -->
---
adr: 2
title: Loyalty reduction is Domain business policy
status: Accepted
chosen: reduction computed by a pure Domain policy
decision: >
  The loyalty reduction is a business rule. It is computed by a pure policy type in
  CheckoutPricing.Domain, which depends on nothing. Application orchestrates it and
  Infrastructure never participates in the calculation.
supersedes: null
date: 2026-08-12
ratified_by: sebastiendegodez (2026-08-12)
---

# ADR-002 — Loyalty reduction is Domain business policy

**Date:** 2026-08-12
**Status:** Accepted

## Context
The previous launch rebate was computed at the transport boundary, which made it untestable
without going through HTTP. The loyalty reduction is a genuine business rule.

## Decision
Compute the reduction in a pure Domain policy. Application orchestrates; Infrastructure is not
involved in pricing.

## Consequences
- The pricing rule is unit-testable without transport or persistence.
- Any design that reads a rate through a repository contradicts this decision.
