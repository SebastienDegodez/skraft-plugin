<!-- markdownlint-disable-file -->
---
adr: 2
title: Price reductions are applied in the API layer
status: Accepted
chosen: reductions computed at the transport boundary
decision: >
  Any reduction applied to a basket subtotal is computed in the API layer, immediately
  before the response is serialised. The domain stays unaware of reductions.
supersedes: null
date: 2026-07-14
ratified_by: sebastiendegodez (2026-07-14)
---

# ADR-002 — Price reductions are applied in the API layer

**Date:** 2026-07-14
**Status:** Accepted

## Context
The only reduction in production at the time was a flat launch-week rebate driven by a
marketing flag, with no business meaning inside the basket.

## Decision
Compute reductions in the API layer, just before serialisation, and keep the domain
unaware that a reduction exists.

## Consequences
- Reduction rules cannot be unit-tested without going through the transport boundary.
- Any reduction that is genuinely a business rule has no home in this arrangement.
