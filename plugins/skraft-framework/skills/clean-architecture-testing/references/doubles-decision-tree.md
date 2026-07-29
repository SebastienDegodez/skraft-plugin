# Doubles Decision Tree (Extended)

Use this when the main decision tree in `SKILL.md` does not answer your case.

## Root Question: What boundary does the test cross?

```dot
digraph doubles {
    "Subject under test" [shape=diamond];
    "Domain object\n(aggregate, VO, policy)" [shape=box];
    "Application handler / use case" [shape=box];
    "Gateway adapter\n(Repository, ReadService, MessageHandler)" [shape=box];
    "HTTP endpoint" [shape=box];

    "Subject under test" -> "Domain object\n(aggregate, VO, policy)" [label="pure business rule"];
    "Subject under test" -> "Application handler / use case" [label="orchestration"];
    "Subject under test" -> "Gateway adapter\n(Repository, ReadService, MessageHandler)" [label="I/O implementation"];
    "Subject under test" -> "HTTP endpoint" [label="wiring"];

    "Domain object\n(aggregate, VO, policy)" -> "No doubles — real objects";
    "Application handler / use case" -> "FakeItEasy on output gateways\n(or hand-written in-memory fake)";
    "Gateway adapter\n(Repository, ReadService, MessageHandler)" -> "Real I/O via Testcontainers / Microcks";
    "HTTP endpoint" -> "WebApplicationFactory + real stack\n+ Microcks for externals";
}
```

## Tie-breakers

### "FakeItEasy vs hand-written fake at Application level"

| Condition | Choose |
|---|---|
| Single test, simple stub (one call, one return) | FakeItEasy |
| >3 tests need the gateway to behave as a store (add / find / update) | Hand-written in-memory fake |
| Test asserts "was the gateway called with X?" | FakeItEasy (verification built-in) |
| Test asserts state ("after N commands, repository contains Y") | In-memory fake (then `repo.GetAll()` in assertion) |

### "In-memory fake vs Testcontainers"

| Layer | Choose | Reason |
|---|---|---|
| Application | In-memory fake (or FakeItEasy) | Acceptance tests must stay <100 ms; the DB is not under test |
| Infrastructure | Testcontainers | The adapter IS the I/O boundary — in-memory defeats the purpose |

`InMemoryDbContext` (EF Core in-memory provider) is **never** acceptable for Infrastructure tests: it accepts invalid SQL, ignores constraints, and silently diverges from the production provider.

### "WebApplicationFactory vs Application test"

| Intent | Choose |
|---|---|
| Verify HTTP status code, route, JSON shape, DI wiring | WebApplicationFactory (API layer) |
| Verify business rule, orchestration, domain event dispatch | Application layer (FakeItEasy) |

If a `WebApplicationFactory` test is used to verify a business rule, it is misplaced — rewrite as an Application test.

### "Microcks vs FakeItEasy at Infrastructure"

| External type | Choose |
|---|---|
| Real HTTP / gRPC API we do not own | Microcks (contract comes from their OpenAPI / proto / AsyncAPI) |
| gRPC / HTTP API we own but lives in another service | Microcks (share the contract) |
| Internal gateway whose implementation we are testing | Neither — this is Application-level; use FakeItEasy |
| Kafka / RabbitMQ topic exchange | Microcks async (contract testing on messages) |

### "Should I add a Domain test?"

```dot
digraph domain_gate {
    "Rule exists?" [shape=diamond];
    "Extracted as Policy / Specification / Domain Service?" [shape=diamond];
    "Large edge-case matrix (>3 non-trivial combinations)?" [shape=diamond];
    "Already covered by Application acceptance test?" [shape=diamond];
    "Write Domain test" [shape=box, style=filled];
    "Do NOT write Domain test" [shape=box, style=filled];

    "Rule exists?" -> "Extracted as Policy / Specification / Domain Service?" [label="yes"];
    "Rule exists?" -> "Do NOT write Domain test" [label="no"];
    "Extracted as Policy / Specification / Domain Service?" -> "Large edge-case matrix (>3 non-trivial combinations)?" [label="yes"];
    "Extracted as Policy / Specification / Domain Service?" -> "Do NOT write Domain test" [label="no"];
    "Large edge-case matrix (>3 non-trivial combinations)?" -> "Already covered by Application acceptance test?" [label="yes"];
    "Large edge-case matrix (>3 non-trivial combinations)?" -> "Do NOT write Domain test" [label="no"];
    "Already covered by Application acceptance test?" -> "Do NOT write Domain test" [label="yes — duplicate coverage"];
    "Already covered by Application acceptance test?" -> "Write Domain test" [label="no"];
}
```

The gate is deliberately restrictive. Domain tests are the exception, not the rule.

## Cheat Sheet

| You are writing… | Layer | Doubles |
|---|---|---|
| `PlaceOrderCommandHandlerTests` | Application | FakeItEasy on `IOrderRepository`, `IDomainEventDispatcher` |
| `OrderRepositoryTests` | Infrastructure | PostgreSQL Testcontainer |
| `PaymentGatewayAdapterTests` | Infrastructure | Microcks REST mock from OpenAPI |
| `OrderPlacedConsumerTests` | Infrastructure | RabbitMQ Testcontainer + Microcks async contract |
| `OrdersEndpointsTests` | API | `WebApplicationFactory<Program>` + Microcks for externals |
| `ArchitectureTests` | Architecture | None — NetArchTest |
| `EligibilityPolicyTests` | Domain | None — real `EligibilityPolicy`, only if extracted with ≥3 edge cases |
