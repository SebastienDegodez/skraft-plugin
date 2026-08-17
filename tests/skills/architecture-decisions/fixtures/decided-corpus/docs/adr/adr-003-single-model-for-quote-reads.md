---
adr: 003
title: Single model for quote reads and writes
status: Accepted
chosen: One shared model
decision: >
  We will serve quote reads from the same model that accepts quote writes, rather than
  maintaining a separate representation for reading.
supersedes: null
date: 2026-05-12
ratified_by: "priya 2026-05-12"
---

# ADR-003: Single model for quote reads and writes

**Status:** Accepted
**Date:** 2026-05-12

## Context

The broker portal shows a saved quote on three screens: the summary list, the detail page
and the printable proposal. A proposal was made to build a dedicated representation for
those screens, kept up to date from the write side, so that the display never has to
assemble a quote from its parts.

Two measurements taken over the April traffic sample argued against it. Reads on the quote
path ran at roughly one and a half times the writes, which is not a ratio that justifies a
second representation. And the shape the screens ask for is very close to the shape the
write side already holds: the summary list needs four fields the write model has, and the
detail page needs the whole thing. Nobody could name a screen whose shape had actually
pulled away from the stored one.

A second representation would also have to be kept in step. The team has no experience
running a projection under a re-rating job that rewrites large batches overnight, and the
window in which the two could disagree is exactly the window a broker uses to compare a
quote against the one they printed an hour ago.

## Decision

We will keep one model for quotes. The portal screens read the same representation the
pricing path writes, assembling the view they need at query time. No separate read
representation is maintained and no synchronisation mechanism is introduced.

## Consequences

**Positive:**
- A saved quote and a displayed quote cannot disagree, because there is only one of them
- A field added to a quote is available to every screen with no second place to update
- No projection to run, monitor, rebuild or reconcile after the nightly batch

**Negative / trade-offs:**
- The summary list pays for assembling whole quotes to show four fields of each
- Read performance is now tied to the write model's shape; tuning one constrains the other
- If read volume or read shape moves away from the write side, this arrangement stops fitting and has to be revisited

**Neutral:**
- Screen queries stay in the adapter layer, unchanged in placement
- Storage technology is unaffected by this choice

## Alternatives Rejected

| Alternative | Reason rejected |
|---|---|
| Maintain a separate read representation updated from the write side | Buys nothing at a read-to-write ratio near parity, and introduces a staleness window on the one screen where brokers compare a printed quote against the live one |
| Cache assembled quotes for the summary list | Same staleness exposure as a separate representation, with an invalidation rule that the nightly re-rating batch would have to know about, for a list that is not currently slow |
| Denormalise the four summary fields onto the stored quote | Splits the quote's own data across two shapes to serve one screen, and the write path would have to keep the duplicate fields honest on every price change |
