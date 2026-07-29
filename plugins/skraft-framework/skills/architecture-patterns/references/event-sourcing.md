# Event Sourcing Complete Guide

## Overview

Event Sourcing is a persistence pattern where the state of an aggregate is derived by replaying a sequence of domain events rather than storing the current state directly. The event store is the system of record — it contains an immutable, append-only log of everything that has happened.

**Core premise:** Instead of storing `eligibility.status = "Eligible"`, the system stores the events that led to that state: `[EligibilityCheckRequested, EligibilityChecked(result=Eligible)]`. State is always derived by replaying those events.

---

## Decision Heuristic

Before applying Event Sourcing, ask:

> **"Does knowing the history of state changes provide business value?"**

If the answer is **NO** — do not use Event Sourcing.

### Use When

| Signal | Example in auto insurance |
|---|---|
| Audit trail is a regulatory or business requirement | Every eligibility decision must be traceable with the full reasoning and data at the time of decision |
| Temporal queries are needed | "What was the eligibility status of driver DRV-001 on 2024-06-15?" |
| Multiple diverging read models of the same data | Eligibility report for driver, eligibility summary for underwriter, eligibility analytics for actuarial |
| Complex DDD Core domain where history matters for invariants | Recalculating risk score based on the full history of incidents |
| Event-driven integration where events are the public API | Downstream contexts (PolicyContext, NotificationContext) subscribe to eligibility events |

### Do NOT Use When

| Signal | Reason |
|---|---|
| Simple CRUD with no audit requirement | Adds infrastructure complexity without benefit |
| No temporal query need | History is stored but never queried — wasted storage and complexity |
| Generic or Supporting subdomain | Commodity features don't justify the pattern |
| Team is unfamiliar and timeline is short | Requires learning: event versioning, upcasting, projections. Train first. |
| No read model divergence | If one read model covers all needs, CQRS projections are not needed |

---

## Aggregate Event Lifecycle

### Step-by-Step

```
1. Receive Command
   → CheckEligibility(driverId, requestedAt)

2. Load Aggregate State
   → Fetch event stream from event store: SELECT events WHERE aggregate_id = driverId ORDER BY version
   → Optionally: load snapshot if available, then replay only events since snapshot

3. Validate Command Against Current State
   → Apply business rules: driver history, risk score, blacklist
   → If invalid: return a domain error (do NOT raise an event)

4. Emit Domain Events
   → EligibilityChecked(driverId, result: Eligible, validUntil: ..., checkedAt: ...)
   → OR: EligibilityDenied(driverId, result: Ineligible, reason: TooManyAccidents, checkedAt: ...)

5. Apply Events to In-Memory State
   → Update aggregate properties by processing the emitted events
   → eligibility.Status = Eligible
   → eligibility.ValidUntil = checkedAt + 30 days

6. Persist Events to Event Store
   → Append events with expected version = current version
   → If stored version != expected version → optimistic concurrency conflict
```

### Pseudo-Code Structure

```
class EligibilityAggregate:
  events: DomainEvent[]
  state: EligibilityState

  static load(eventStream: DomainEvent[]) → EligibilityAggregate:
    aggregate = new EligibilityAggregate()
    for event in eventStream:
      aggregate.apply(event)
    return aggregate

  check(driverHistory, riskScore, requestedAt):
    if violates_invariants(driverHistory, riskScore):
      emit EligibilityDenied(...)
    else:
      emit EligibilityChecked(...)

  emit(event):
    this.events.append(event)
    this.apply(event)

  apply(event):
    match event:
      EligibilityChecked: this.state.status = Eligible; this.state.validUntil = event.validUntil
      EligibilityDenied: this.state.status = Ineligible; this.state.reason = event.reason
```

---

## Event Store Design

### Properties

| Property | Description |
|---|---|
| Append-only | Events are never updated or deleted. The log is immutable. |
| Versioned | Each event has a version number (monotonically increasing per aggregate). |
| Ordered | Events within an aggregate are ordered by version. |
| Immutable | An event's payload never changes after it is written. |

### Event Record Structure

```
Event:
  - aggregate_id: string         ← the ID of the aggregate this event belongs to
  - aggregate_type: string       ← "EligibilityAggregate"
  - version: int                 ← monotonically increasing, per aggregate
  - event_type: string           ← "EligibilityChecked"
  - payload: JSON                ← the event data
  - occurred_at: DateTimeOffset  ← when the event occurred (domain time)
  - recorded_at: DateTimeOffset  ← when the event was stored (technical time)
  - correlation_id: string?      ← tracing across services
  - causation_id: string?        ← the command or event that caused this event
```

### Optimistic Concurrency

When appending, pass the expected version. If the store's current version for that aggregate differs, a concurrent write has occurred.

```
event_store.append(
  aggregate_id = driverId,
  events = [eligibilityCheckedEvent],
  expected_version = 7   ← "I expect the current version to be 7"
)
// If stored version is 8 → raise OptimisticConcurrencyException
```

---

## Projections and Read Models

### Definition

A projection is a function that processes a stream of domain events to build a read model. Projections are the query side of a CQRS + Event Sourcing system.

### Properties

| Property | Description |
|---|---|
| Disposable | A projection can be dropped and rebuilt from the full event log at any time |
| Eventually consistent | The read model lags behind the event store by the processing delay |
| Purpose-specific | One projection per read concern — never a generic "catch-all" projection |
| Stateful | A projection maintains its own state (the read model) outside the event store |

### Projection Design

```
Projector: EligibilityStatusProjector
  Handles: EligibilityChecked, EligibilityDenied, EligibilityExpired

  on EligibilityChecked(event):
    upsert eligibility_read_model set
      status = 'Eligible',
      valid_until = event.validUntil,
      last_checked_at = event.checkedAt
    where driver_id = event.driverId

  on EligibilityDenied(event):
    upsert eligibility_read_model set
      status = 'Ineligible',
      rejection_reason = event.reason,
      last_checked_at = event.checkedAt
    where driver_id = event.driverId
```

### Rebuilding a Projection

1. Drop the read model table (or truncate it)
2. Reset the projection's checkpoint to position 0
3. Replay all events from the beginning of the event store
4. The projection rebuilds itself by processing every historical event

This is possible because events are immutable and the event store is append-only.

### Consistency Guarantee

Projections are **eventually consistent**. A command that successfully appends an event will not immediately reflect in the read model. For most use cases this is acceptable. For "read-your-own-writes" requirements, use a consistency token (see Eventual Consistency Mitigation section).

---

## Snapshots

### Purpose

Avoid replaying hundreds or thousands of events every time an aggregate is loaded. A snapshot stores the aggregate's state at a point in time.

### When to Use

- Event count per aggregate exceeds approximately 500 events
- Load time for a high-traffic aggregate becomes measurable
- The aggregate has long-running processes (sagas, policies that renew annually)

### Snapshot Strategy

```
1. After every N events (e.g., every 100), store a snapshot:
   snapshot:
     aggregate_id: driverId
     aggregate_type: EligibilityAggregate
     version: 100         ← the version at snapshot time
     state: { ... }      ← serialised aggregate state
     taken_at: ...

2. On aggregate load:
   a. Load the most recent snapshot (if any)
   b. Replay only events with version > snapshot.version
```

### Trade-offs

| Benefit | Cost |
|---|---|
| Faster aggregate load | Additional storage for snapshot records |
| Reduced replay cost | Must invalidate snapshots on schema changes |
| Bounded replay window | Snapshot logic adds complexity to the repository |

---

## Sagas / Process Managers

### Definition

A Saga coordinates a multi-step business workflow that spans multiple aggregates. It reacts to domain events and issues commands to other aggregates.

### Position in Architecture

Sagas are Application-layer objects. They are NOT aggregates. They do not enforce domain invariants.

### Structure

```
EligibilityRenewalSaga:
  state:
    - driverId: DriverId
    - renewalRequestedAt: DateTimeOffset
    - status: Started | RenewalApproved | NotificationSent | Completed

  on EligibilityExpired(event):
    this.driverId = event.driverId
    this.status = Started
    issue_command RenewEligibility(driverId: event.driverId)

  on EligibilityRenewed(event):
    this.status = RenewalApproved
    issue_command NotifyDriver(driverId: event.driverId, message: "Your eligibility has been renewed")

  on DriverNotified(event):
    this.status = Completed
```

### Compensating Transactions

If a step fails, the Saga issues compensating commands to undo the work of previous steps.

```
  on EligibilityRenewalFailed(event):
    issue_command NotifyDriverOfFailure(driverId: event.driverId, reason: event.reason)
    this.status = Failed
```

---

## Upcasting

### Problem

Event payloads change over time. An `EligibilityChecked` event written in 2024 may have a different structure than the same event type written in 2026. When replaying historical events, the old format must be transformed to the current format.

### Strategies

| Strategy | When | Approach |
|---|---|---|
| Weak schema | Minor additions (new optional fields) | Ignore unknown fields during deserialisation; fill missing fields with defaults |
| Explicit upcaster | Breaking changes (field renamed, removed, or semantically changed) | Transform old event format to current format in a chain of upcasters |

### Upcaster Chain

```
V1 → V2 upcaster: rename field `riskClass` → `riskScore`
V2 → V3 upcaster: split field `result` (string) into `eligible` (bool) + `rejectionReason` (nullable)

On load: apply V1→V2, then V2→V3 in sequence
```

**Rule:** Never skip a version step in the upcaster chain. Never modify stored events to fix schema problems.

---

## Conflict Resolution

### Optimistic Concurrency by Scenario

| Scenario | Concurrent situation | Strategy |
|---|---|---|
| Two UI sessions for the same driver | Driver opens two tabs and submits two eligibility checks | Retry — reload aggregate and reapply the second command |
| Two agents claim the same appointment slot | Both agents call `BookSlot` at the same time | Domain-specific merge — check if the slot is still available after reload; reject if taken |
| Financial credit/debit pair | Two debits attempt to reduce balance simultaneously | Reject — return a conflict error; require explicit retry by the caller |
| Two independent writes to different fields | No invariant spans both fields | May be domain-mergeable — depends on the invariant |

### Retry Policy

1. Catch the `OptimisticConcurrencyException`
2. Reload the aggregate (replay from event store)
3. Re-validate the command against the new state
4. If valid: reapply the command and attempt to save again
5. If still invalid: return a domain error to the caller
6. Limit retries to 3 attempts; after that, surface an error

---

## Eventual Consistency Mitigation

### Read-Your-Own-Writes

**Problem:** A user submits a command and immediately queries the read model. The projection has not yet processed the event. The user sees stale data.

**Solution:**
1. The command handler returns a consistency token: `{ commandId: "cmd-001", version: 42 }`
2. The query endpoint accepts a `waitForVersion` parameter
3. The query handler waits (up to a timeout) for the projection to reach the specified version before returning

### Optimistic UI Updates

**Problem:** Waiting for projection catch-up adds latency.

**Solution:** The UI applies the expected state change immediately based on the command it submitted. It then reconciles when the server projection confirms the change. If there is a conflict, the UI reverts.

### Causal Consistency Tokens

For distributed systems, pass a token that encodes "process everything up to event version N before responding to this query." The query service uses this token to determine if its projection is current enough to answer.

---

## Outbox Pattern

### Problem

After a command succeeds, the aggregate emits domain events. These events must be:
1. Persisted to the event store (internal)
2. Published to a message broker (external integration)

If step 1 succeeds but step 2 fails, downstream contexts never receive the event. If you retry step 2, you may publish a duplicate. This is the dual-write problem.

### Solution

```
1. In the same database transaction:
   a. Append domain events to the event store
   b. Insert event records into the outbox table with status = 'pending'

2. A background relay process (runs continuously):
   a. SELECT events FROM outbox WHERE status = 'pending' ORDER BY created_at
   b. Publish each event to the message broker
   c. Mark the outbox record as 'sent'

3. The relay uses at-least-once delivery semantics:
   → Consumers must be idempotent (handle duplicate events gracefully)
```

### Outbox Table Structure

```
outbox:
  - id: UUID
  - event_type: string
  - payload: JSON
  - aggregate_id: string
  - created_at: DateTimeOffset
  - status: pending | sent | failed
  - sent_at: DateTimeOffset?
  - retry_count: int
```

---

## Reservation Pattern

### Problem

In an event-sourced system, uniqueness constraints (e.g., "no two drivers can have the same licence number") cannot be enforced by a single aggregate — the aggregate only sees its own event stream.

### Solution

Create a separate `ReservationAggregate` for the unique key.

```
ReservationAggregate:
  id: LicenceNumberReservation
  licenceNumber: string
  reservedFor: DriverId?
  status: Available | Reserved

Commands:
  ReserveLicenceNumber(licenceNumber, driverId)
    → LicenceNumberReserved (if available)
    → LicenceNumberAlreadyTaken (if reserved by another driver)

  ReleaseLicenceNumber(licenceNumber, driverId)
    → LicenceNumberReleased
```

The driver registration flow:
1. Issue `ReserveLicenceNumber` command
2. On `LicenceNumberReserved` event: proceed with `RegisterDriver` command
3. On `LicenceNumberAlreadyTaken` event: return validation error to the caller

---

## Auto-Insurance Examples Throughout

| Concept | Example |
|---|---|
| Aggregate lifecycle | `EligibilityAggregate.Check(driverHistory, riskScore)` emits `EligibilityChecked` |
| Event store entry | `{ aggregate_id: "DRV-001", event_type: "EligibilityChecked", version: 3, payload: { result: "Eligible", validUntil: "2027-05-14" } }` |
| Snapshot trigger | Driver DRV-001 has 600 eligibility check events — snapshot taken at version 500 |
| Saga | `EligibilityRenewalSaga` reacts to `EligibilityExpired`, issues `RenewEligibility`, then `NotifyDriver` |
| Upcasting | `EligibilityChecked` V1 had `result: "OK"` — upcasted to V2 `result: "Eligible"` |
| Outbox | `EligibilityChecked` event stored in event store + outbox; relay publishes to `eligibility.events` topic for `PolicyContext` to consume |
| Reservation | `LicenceNumber("X1234-BC")` reserved before `RegisterDriver` command proceeds |
