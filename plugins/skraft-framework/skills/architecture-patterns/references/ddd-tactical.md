# DDD Tactical Patterns

Design tactically only inside a bounded context already defined strategically. Every element maps
to a domain concept, never to a technical need.

## Aggregate

An aggregate is identified by the invariants it owns, not the data it holds.

- Do not create one for a list that is only queried, one per database table, or a God aggregate
  owning every entity of a context.
- An operation that must update two aggregates makes them eventually consistent (domain events +
  saga or Application event handler), never one transaction and never a direct call between
  aggregates.

Example: `Eligibility` root (EligibilityId, DriverId, Status, ValidUntil) with value objects
`RiskScore`, `DriverHistory`; invariant "eligible only with RiskScore below 75 and fewer than 3
accidents in 5 years"; raises `EligibilityChecked` or `EligibilityDenied`.

## Entity

Identity persists across state changes: natural key (`PolicyNumber`), surrogate (UUID), or
composite (`DriverId`, `PolicyId`). Its lifecycle is expressed by events of the owning aggregate.

## Value object

Never expose setters; return a new instance. Use it for any concept defined only by its
attributes, any measurement or identifier with domain meaning. Not for something with persistent
identity (entity) or a technical DTO.

| Value object | Invariant |
|---|---|
| `RiskScore` | 0–100 |
| `DateRange` | `to` after `from` |
| `Money` | Non-negative amount, ISO 4217 currency |

## Domain event

- Past tense; avoid `Event` and `Completed` suffixes.
- Payload: aggregate id, referenced ids, the fact, occurrence time, optional reason. No computed
  fields or display labels: projections compute them.
- Never raised by an Application service, a use case or Infrastructure.

## Repository

- `IEligibilityRepository`, never `IRepository<T>`.
- Business method names (`GetByDriverId`, `FindExpiredEligibilities(asOf)`); no expression,
  `IQueryable`, navigation property or database id in the interface.
- A display-only read (no mutation follows) uses a read store returning a ViewModel, never the
  repository: see `cqrs.md`.

## Domain service

Extract when the logic spans several aggregates and neither owns it, or needs a domain concept
from two aggregates, or would bloat an aggregate. Orchestration belongs to a use case.

## Specification

Use for multi-condition rules that must be composed, named in business language and tested
independently:

```
Eligible = HasCleanRecord.And(HasMinimumExperience).And(IsLicenceValid).And(Not(IsBlacklisted))
```
