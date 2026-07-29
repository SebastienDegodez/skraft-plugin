# Architecture Anti-Patterns

## Overview

Anti-patterns are recurring design mistakes that seem reasonable at first but cause systemic problems as the codebase grows. Each entry below identifies the problem, explains why it happens, and gives the correct approach.

All examples use the auto-insurance (MonAssurance — eligibility check) domain where relevant.

---

## AP-01: Anemic Domain Model

**Name:** Anemic Domain Model

**Problem:** Domain objects (aggregates, entities) are pure data bags — they contain properties and getters/setters but no business behaviour. All logic lives in application services, managers, or helper classes.

**Why it happens:**
- Teams familiar with procedural or transaction-script programming apply those patterns to object-oriented code
- "Separation of concerns" is misinterpreted as "data here, logic elsewhere"
- The domain model was designed by looking at the database schema, not the business rules

**Consequences:**
- Business invariants are scattered across application services — hard to find, easy to duplicate
- The Ubiquitous Language is not enforced at the type level
- Testing domain logic requires wiring up application-layer infrastructure
- The domain model provides no protection against invalid state

**Fix:**
Move business behaviour back into the aggregate. Replace `eligibility.Status = "Eligible"` with `eligibility.Check(driverHistory, riskScore)` — a method that enforces invariants and raises the appropriate event.

**Auto-insurance example:**
```
// Anemic: setter open to any value
eligibility.Status = "Eligible";
eligibility.ValidUntil = DateTime.UtcNow.AddDays(30);

// Rich domain model: invariant enforced inside the aggregate
eligibility.Check(driverHistory, riskScore, requestedAt);
// → raises EligibilityChecked or EligibilityDenied
```

---

## AP-02: Big Ball of Mud

**Name:** Big Ball of Mud

**Problem:** No bounded context separation. Everything is in one large domain model. `Policy`, `Eligibility`, `Driver`, `Claim`, and `Billing` all reference each other freely.

**Why it happens:**
- DDD Strategic Design was skipped
- The team modelled the database entity-relationship diagram as the domain model
- Short-term delivery pressure prevented drawing explicit boundaries

**Consequences:**
- A change to `Driver` in the billing context breaks the eligibility context
- Deployments require full-system regression testing
- Team autonomy is impossible — any team's change can affect any other team's feature
- The domain language is ambiguous: `Driver` means something different in policy vs eligibility

**Fix:**
Identify language boundaries. Start with the Core subdomain (eligibility engine). Define its Ubiquitous Language and draw a boundary. Treat anything outside that boundary as an external system requiring an integration interface.

---

## AP-03: Transaction Script

**Name:** Transaction Script

**Problem:** Business logic is implemented as sequential procedures that execute step by step. Each "use case" is a script that fetches data, applies rules inline, and saves results — with no domain model in between.

**Why it happens:**
- Teams coming from CRUD or ETL backgrounds apply the same pattern to business domains
- The feature seems "too simple" to justify aggregates

**Consequences:**
- Duplication: the same business rule (e.g., "a driver must have fewer than 3 accidents") is copy-pasted in multiple scripts
- No encapsulation: the business rule is not named, not tested in isolation, and not discoverable
- Invariants are broken by any script that bypasses the check

**Fix:**
Introduce a domain model. Extract the business rule into a method on the aggregate or a Specification. The script becomes a thin application layer that delegates to the domain.

---

## AP-04: Repository Used in Domain

**Name:** Repository Used in Domain

**Problem:** The domain layer imports and calls a repository directly. An aggregate method calls `IEligibilityRepository` to fetch another aggregate.

**Why it happens:**
- The aggregate needs data from another aggregate to enforce an invariant
- The developer is unfamiliar with the dependency rule

**Consequences:**
- Domain layer now depends on the Application layer (or worse, Infrastructure) — violates the dependency rule
- Domain cannot be tested without wiring up the repository
- The Clean Architecture boundary is broken: inner layer depends on outer layer

**Fix:**
Pass the needed data into the domain method as a parameter. Fetch it in the Application layer (use case) before calling the domain method. The aggregate receives the data it needs; it does not go to fetch it.

**Auto-insurance example:**
```
// Wrong: aggregate fetches another aggregate
public void Check(IEligibilityRepository repo)
{
    var history = repo.GetDriverHistory(this.DriverId); // ← domain imports Application interface
}

// Correct: application layer fetches and passes in
var history = await _driverHistoryRepo.GetByDriverId(command.DriverId);
eligibility.Check(history, riskScore, command.RequestedAt);
```

---

## AP-05: Fat Aggregate

**Name:** Fat Aggregate

**Problem:** An aggregate owns too many entities and tries to enforce invariants that belong to other aggregates. `PolicyAggregate` contains `Driver`, `Vehicle`, `Coverage`, `Claim`, and `BillingSchedule` — and enforces consistency across all of them.

**Why it happens:**
- "If they need to be consistent, they must be in the same aggregate" is applied too broadly
- The database schema has foreign keys between these entities, so they end up in one aggregate

**Consequences:**
- Every operation on the aggregate loads the entire object graph — performance problems
- Lock contention: concurrent operations conflict because they all lock the same aggregate
- Complexity: the aggregate has dozens of invariants, some of which belong to separate business domains

**Fix:**
Split by invariant ownership. Ask: "Which invariants must be atomic?" Only those entities belong in the same aggregate. Use eventual consistency for cross-aggregate rules. Reference other aggregates by ID.

---

## AP-06: Event Sourcing Everywhere

**Name:** Event Sourcing Everywhere

**Problem:** Event Sourcing is applied to every aggregate regardless of whether history has business value.

**Why it happens:**
- "We use DDD, so we must use Event Sourcing" — incorrect: they are independent patterns
- The architect saw Event Sourcing in a successful project and applied it uniformly
- No decision heuristic was applied

**Consequences:**
- Supporting and Generic subdomains carry the full operational weight of an event store
- Teams must learn event schema versioning, upcasting, and projection rebuilding for trivial features
- Operational complexity grows without commensurate business benefit

**Fix:**
Apply the decision heuristic: "Does knowing the history of state changes provide business value?" Only apply Event Sourcing where the answer is yes — typically Core subdomain aggregates with audit trail or temporal query requirements.

---

## AP-07: Leaky Abstraction

**Name:** Leaky Abstraction

**Problem:** The Application layer interface (repository, gateway) exposes infrastructure-specific types. `IEligibilityRepository` returns `IQueryable<EligibilityEntity>` or accepts `Expression<Func<Eligibility, bool>>` predicates.

**Why it happens:**
- The repository interface was generated from an ORM or copied from an Infrastructure-first codebase
- "Flexibility" — the developer wants to support any query at the interface level

**Consequences:**
- The Application layer is now coupled to ORM concepts
- Infrastructure cannot be swapped without changing the Application layer
- Domain logic leaks into query expressions written in the Application layer

**Fix:**
Design the repository interface in terms of domain concepts. Named methods: `GetByDriverId`, `FindEligibleDrivers`. No expressions, no `IQueryable`. The Infrastructure implementation translates these domain methods into whatever the persistence layer requires.

---

## AP-08: Missing Anti-Corruption Layer

**Name:** Missing Anti-Corruption Layer

**Problem:** A bounded context adopts a Conformist relationship with a legacy or third-party system when an ACL was needed. The legacy system's model pollutes the downstream domain.

**Why it happens:**
- Building the ACL is seen as extra work — "it's just a field mapping"
- The team underestimates how much the upstream model diverges from their own language

**Consequences:**
- The downstream domain model contains concepts from the upstream legacy system
- When the upstream changes, the change propagates directly into the downstream domain
- The Ubiquitous Language is diluted — `LegacyContractRecord` appears in eligibility business logic

**Auto-insurance example:** A legacy policy administration system exposes `ContractRecord.RiskClass` where the eligibility context should use `RiskScore`. Without an ACL, `RiskClass` appears throughout the eligibility domain.

**Fix:**
Build the ACL. Create a translation layer that converts the upstream model into the downstream's Ubiquitous Language. The downstream aggregate never sees the upstream type.

---

## AP-09: God Use Case

**Name:** God Use Case

**Problem:** A single application layer use case orchestrates 10+ aggregates, calls multiple external services, contains 200+ lines of code, and manages transaction scope across the entire process.

**Why it happens:**
- A complex workflow was not decomposed into sagas or multiple use cases
- The developer tried to make one feature "transactional" by putting everything in one handler

**Consequences:**
- The use case is untestable in isolation
- A failure in step 7 of 12 leaves the system in a partially consistent state
- Changes to any aggregate touched by the use case require changes to the god use case
- The use case has no single responsibility

**Fix:**
Decompose into smaller use cases. Use a Saga for cross-aggregate coordination. Each use case should orchestrate one aggregate (or a few closely related ones). The Saga handles the multi-step workflow and compensating actions on failure.

---

## AP-10: CQRS Without Read Models

**Name:** CQRS Without Read Models

**Problem:** CQRS is adopted syntactically — separate `Command` and `Query` classes exist — but the query handler returns the domain aggregate or the command-side ORM entity directly. There is no dedicated read model.

**Why it happens:**
- The team adopted the CQRS vocabulary without understanding the purpose
- "We added CQRS" is seen as an architectural achievement regardless of whether read models exist

**Consequences:**
- The domain aggregate is exposed to the presentation layer — a Clean Architecture violation
- The query side is just as heavy as the command side — no performance benefit
- Display concerns leak into the domain model as navigation properties and virtual fields
- The command-side model cannot evolve independently from the read shape

**Fix:**
Build dedicated read models: flat, denormalised, shaped for the consumer. The query handler reads from a projection table or view, returns a DTO, and never loads a domain aggregate.

**Auto-insurance example:**
```
// Wrong: query returns the domain aggregate
public async Task<EligibilityAggregate> Handle(GetEligibilityQuery query)
{
    return await _repo.GetByDriverId(query.DriverId); // ← domain object to presentation
}

// Correct: query returns a purpose-built read model
public async Task<EligibilityResultDto> Handle(GetEligibilityQuery query)
{
    return await _readRepo.GetEligibilityResult(query.DriverId); // ← flat DTO
}
```
