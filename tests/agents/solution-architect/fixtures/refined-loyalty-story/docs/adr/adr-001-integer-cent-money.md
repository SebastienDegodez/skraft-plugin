<!-- markdownlint-disable-file -->
---
adr: 1
title: Money is carried as integer cents
status: Accepted
chosen: integer cents everywhere
decision: >
  Every monetary amount crossing a boundary of this service is an integer number of
  cents. No decimal or floating-point money type is introduced.
supersedes: null
date: 2026-07-02
ratified_by: sebastiendegodez (2026-07-02)
---

# ADR-001 — Money is carried as integer cents

**Date:** 2026-07-02
**Status:** Accepted

## Context
Checkout amounts were previously expressed with a decimal type, and rounding differed
between the pricing path and the payment path.

## Decision
Carry every monetary amount as an integer number of cents, at every boundary.

## Consequences
- Rounding is an explicit, testable business rule rather than a formatting accident.
- Any percentage-based pricing rule must state how it lands on a whole cent.
