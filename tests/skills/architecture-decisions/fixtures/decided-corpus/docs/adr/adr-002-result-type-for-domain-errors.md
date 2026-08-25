---
adr: 002
title: Result type for expected domain errors
status: Accepted
chosen: Result return value
decision: >
  We will return an explicit result value for outcomes the business expects, such as a
  declined risk, and keep exceptions for faults the caller cannot act on.
supersedes: null
date: 2026-03-24
ratified_by: "marc 2026-03-24"
---

# ADR-002: Result type for expected domain errors

**Status:** Accepted
**Date:** 2026-03-24

## Context

A quote can fail for reasons the business planned for: the risk falls outside the
underwriting appetite, the postcode is not covered, the driver is below the minimum age.
These are ordinary answers to a broker's question, not faults.

Today all of them are signalled by throwing. Three consequences showed up in production
support. The broker API returns 500 for a perfectly normal decline, because the transport
layer cannot tell an appetite decline from a failed database call. The re-rating job aborts
its whole batch on the first declined policy. And the underwriting rules are hard to read,
because the reason a quote is refused is only discoverable by reading catch blocks several
layers away from the rule that produced it.

## Decision

We will represent expected domain outcomes as a returned result value carrying either the
priced quote or a typed decline reason. Domain operations that can legitimately refuse
return that value; they do not throw for it. Exceptions remain for faults the caller cannot
act on — a lost connection, a corrupt actuarial table, a bug. Adapters map decline reasons
to their own vocabulary, so the broker API answers a decline with a business status and a
reason code rather than a server error.

## Consequences

**Positive:**
- A decline and an outage stop looking identical to callers
- The batch job can record a declined policy and continue with the rest
- The set of reasons a quote can be refused is visible in the signature of the rule

**Negative / trade-offs:**
- Every caller must handle both branches; a forgotten branch is now a compile-time chore rather than an invisible propagation
- Composing several operations that can each decline requires deliberate plumbing that a throw did not need
- Two error mechanisms coexist, and the boundary between them has to be argued for each new failure

**Neutral:**
- Logging volume shifts: declines stop appearing in the error log and appear in business telemetry instead
- No change to how infrastructure faults are surfaced or retried

## Alternatives Rejected

| Alternative | Reason rejected |
|---|---|
| Keep throwing, but define one exception subtype per decline reason | The transport layer still cannot distinguish a decline from a fault without an ever-growing catch list, and the batch job keeps unwinding through code that has no interest in the decline |
| Return null or a sentinel quote for a decline | The reason for the refusal is lost, and the broker API cannot tell a decline apart from a missing record, which is the exact confusion this decision exists to remove |
| Collect declines in an ambient context object read after the call | Makes the outcome invisible in the signature and unsafe under the concurrent pricing the re-rating job already relies on |
