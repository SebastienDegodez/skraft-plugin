<!-- markdownlint-disable-file -->
---
adr: 002
title: Round tier reductions in the customer's favour
status: Proposed
chosen: floor-charged-cents
decision: >
  Floor the charged amount to a whole cent after applying the tier percentage.
supersedes: null
date: 2026-08-14
ratified_by: null
---

# ADR-002 — Round tier reductions in the customer's favour

**Date:** 2026-08-14
**Status:** Proposed
**Deciders:** Solution Architect (proposed), pending human ratification
## Context
Tier percentages applied to integer cents (ADR-001) produce fractions of a cent. The refined
scope requires every reduction to land on a whole cent in the customer's favour.


## Decision
Apply the tier percentage in the Domain and floor the charged amount to a whole cent.


## Consequences
- Customers never pay a fraction of a cent more than the exact reduction.
- Finance reconciles the rounding difference per basket.

## Alternatives rejected
- Banker's rounding: rejected, can round against the customer.

