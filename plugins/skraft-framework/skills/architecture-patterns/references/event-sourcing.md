# Event Sourcing

State is derived by replaying the aggregate's events; the append-only event store is the system
of record. Apply only after the decision heuristic in SKILL.md says yes. Also skip it when one
read model covers every need and nothing queries history, or when the team must first learn
versioning, upcasting and projections on a short timeline.

## Aggregate lifecycle

1. Receive the command.
2. Load: latest snapshot if any, then replay events with a higher version.
3. Validate against current state. Invalid → return a domain error; raise no event.
4. Emit events; each emitted event is appended to the pending list and applied to in-memory
   state through the same `apply` used for replay.
5. Append the events with the **expected version** (optimistic concurrency).

## Event store

Append-only, ordered and versioned per aggregate, immutable payloads. Record: aggregate id and
type, version, event type, payload, occurred-at (domain time), recorded-at, optional correlation
and causation ids. Never modify a stored event, including to fix a schema problem.

## Projections

One projector per read concern, handling a named set of event types; disposable (truncate, reset
the checkpoint to 0, replay everything); eventually consistent.

## Snapshots

Take one every N events (e.g. 100) when an aggregate exceeds about 500 events or its load time is
measurable. Store version and serialized state; invalidate on state schema change.

## Sagas / process managers

Application-layer objects, never aggregates, holding no domain invariant. They react to events,
issue commands, persist their own state, and issue compensating commands when a step fails.
Example: on `EligibilityExpired` issue `RenewEligibility`; on `EligibilityRenewed` issue
`NotifyDriver`; on `EligibilityRenewalFailed` issue `NotifyDriverOfFailure`.

## Upcasting

| Change | Strategy |
|---|---|
| New optional field | Weak schema: ignore unknown fields, default missing ones |
| Field renamed, removed or changed in meaning | Explicit upcaster, chained V1→V2→V3; never skip a version |

## Concurrency conflicts

| Situation | Strategy |
|---|---|
| Transient (two UI sessions) | Retry: reload, re-validate, reapply; at most 3 attempts, then surface an error |
| Domain-specific (two agents book one slot) | Reload and apply domain logic; reject if no longer valid |
| Critical (double spend) | Reject with a conflict error; the caller retries explicitly |
| Writes to independent fields, no spanning invariant | May be merged |

## Eventual consistency

- Read-your-own-writes: the command returns a version token; the query waits (bounded) until the
  projection reaches it.
- Optimistic UI: apply the expected change, reconcile or revert on confirmation.
- Causal token: "process everything up to version N before answering".

## Outbox

Publishing to a broker after appending is a dual write. In one transaction append the events and
insert them into an outbox table (`pending`); a relay publishes pending rows in order and marks
them `sent`. Delivery is at least once: consumers are idempotent. Every external event publication
goes through the outbox.

## Reservation

A uniqueness constraint (unique licence number) cannot be enforced by one aggregate's stream. A
`Reservation` aggregate per unique key handles `Reserve` → `Reserved` or `AlreadyTaken`, and
`Release`; the registration proceeds only after `Reserved`. A state-based store uses a unique
index instead.
