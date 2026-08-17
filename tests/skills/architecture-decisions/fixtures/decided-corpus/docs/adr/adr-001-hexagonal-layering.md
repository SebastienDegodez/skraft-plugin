---
adr: 001
title: Hexagonal layering for the quoting platform
status: Accepted
chosen: Ports and adapters
decision: >
  We will keep pricing and eligibility rules in a domain layer that depends on no
  infrastructure, reached only through ports implemented by adapters.
supersedes: null
date: 2026-02-10
ratified_by: "priya 2026-02-10"
---

# ADR-001: Hexagonal layering for the quoting platform

**Status:** Accepted
**Date:** 2026-02-10

## Context

The quoting platform prices motor and household policies. The first two releases put
rating rules directly in the controllers that received broker requests, and again in the
nightly re-rating job. The same premium was computed by two code paths that had already
drifted twice: a broker quote and its overnight refresh could differ by a few cents for
the same risk, and neither path could be exercised without a database and a message broker.

Rating rules change every quarter when the actuarial tables are reissued. The team needs
to change them in one place and to test them without standing up infrastructure.

## Decision

We will structure the platform as a domain layer surrounded by ports and adapters. Rating,
eligibility and premium assembly live in the domain and reference no framework, no
persistence type and no transport type. Everything the domain needs from the outside — risk
tables, policy storage, broker notification — is expressed as a port interface owned by the
domain and implemented by an adapter in the infrastructure layer. Controllers and the
re-rating job are both adapters that call the same domain entry points.

## Consequences

**Positive:**
- One rating path serves the broker request and the nightly refresh, so the two cannot drift
- Rating rules are testable with plain objects, without a database or a broker
- Actuarial table changes touch the domain and its tests, not the transport layers

**Negative / trade-offs:**
- Every outbound call needs a port interface and an adapter, so simple lookups cost two extra types
- Mapping between adapter payloads and domain types is real work that has to be written and maintained
- Newcomers who expect to find the rating logic behind the controller have to learn where it moved

**Neutral:**
- Framework choice for the transport layer stays open, since it is confined to adapters
- Existing persistence technology is unchanged; only the direction of the dependency moved

## Alternatives Rejected

| Alternative | Reason rejected |
|---|---|
| Keep the rules in the controllers and extract a shared helper for the nightly job | The helper still needs the request and persistence types to compile, so the rules stay untestable without infrastructure and the drift can reappear the first time one caller specialises the helper |
| Move the rules into database routines so both callers share one implementation | Rating rules would become untestable in the build, versioned outside the application, and unavailable to the offline quote calculator the broker desktop app needs |
