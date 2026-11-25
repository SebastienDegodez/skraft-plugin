# Architecture Anti-Patterns

| # | Anti-pattern | Symptom | Fix |
|---|---|---|---|
| AP-01 | Anemic domain model | Aggregates are data bags; `eligibility.Status = "Eligible"` set from a service | Behaviour on the aggregate: `eligibility.Check(history, riskScore, at)` enforces invariants and raises the event |
| AP-02 | Big Ball of Mud | No context boundary; `Policy`, `Driver`, `Claim`, `Billing` reference each other | Draw boundaries where the language changes, Core first; everything outside is an integration |
| AP-03 | Transaction script | Each use case fetches, applies rules inline, saves; the same rule copied across scripts | Name the rule on the aggregate or as a Policy / Specification; the use case delegates |
| AP-04 | Repository used in Domain | An aggregate method takes or calls a repository | The use case fetches the data and passes it to the domain method |
| AP-05 | Fat aggregate | One aggregate owns Driver, Vehicle, Coverage, Claim, Billing | Split by which invariants must be atomic; reference by id; eventual consistency for the rest |
| AP-06 | Event Sourcing everywhere | Event store on Supporting/Generic aggregates | Apply the history-has-value heuristic per aggregate |
| AP-07 | Leaky abstraction | Interface returns `IQueryable` or takes `Expression<Func<…>>` | Domain-named methods; translation inside Infrastructure |
| AP-08 | Missing ACL | Upstream types (`LegacyContractRecord.RiskClass`) appear in downstream domain code | Translation layer into the downstream language; the aggregate never sees the upstream type |
| AP-09 | God use case | One handler orchestrates 10+ aggregates and external calls across one transaction | Split use cases; a saga coordinates the workflow and its compensations |
| AP-10 | CQRS without read models | Query handler returns the aggregate or ORM entity | Dedicated flat read model from a projection or read store |
| AP-11 | Controller bypasses the use case | Controller injects a repository | Controller sends a command or query to a use case |
