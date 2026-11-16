# Walking Skeleton and Infrastructure Policy

## Definition

The walking skeleton is the outer loop of the story's double-loop TDD: the thinnest test that runs
the **real path**, from the component's entry point through the use case to its real internal
gateways. It proves the wiring before any scenario adds behaviour. It is a plain test, never a
Gherkin binding. S1 keeps its own acceptance test, the Cucumber binding of its Gherkin, like every
other scenario.

| | Walking skeleton | Acceptance test of S1 (and of every scenario) |
|---|---|---|
| Proves | the wiring of the whole chain | the scenario's business rule |
| Form | plain test, no Gherkin | binding of the scenario's `.feature` lines |
| Place | the component's integration-test place | the component's unit-test place |
| Enters by | the real entry point (HTTP, CLI, message), wired by the production composition root | the use case |
| Runs on | the walking skeleton column of the policy below | the targeted column |
| Asserts | the status, the shape of the response, and one value S1 names, word for word | every value of the scenario, word for word |
| Written | in DISTILL, first, with the skeleton of every class of the chain it lacks | in DISTILL, on its own pass after the walking skeleton |
| One per | story | scenario |

- S1 is the scenario the walking skeleton walks: tagged `@walking-skeleton` in the `.feature`
  and in the test plan's `## Scenarios` table, always S1. The tag never removes S1 from the
  Cucumber run.
- In a back-end component; a React front end has none (its end-to-end run is Playwright's).
- The skeleton of the chain: the entry point, the use case, its ports and adapters and their
  wiring, each returning the empty value of its type; reuse what exists, create only what is missing.
- Green: S1 passes when its acceptance test and the walking skeleton both pass; the walking
  skeleton stays green at every later scenario's green.

---

## Exemptions

A story with no new path to prove declares it under the `## Scenarios` table and tags no scenario
`@walking-skeleton`. An exemption removes the walking skeleton only: S1 keeps its acceptance test.

```
Walking skeleton exemption: library
```

| Exemption | Holds when | Contradicted by |
|---|---|---|
| `library` | the component is a pure library: no entry point | an entry point in the component |
| `refactoring` | the story adds no public interface | a new endpoint, command, message or public type |
| `docs-only` | the story changes configuration or documentation only | a changed source file |

An exemption the story's changes contradict is a blocker.

---

## Infrastructure Policy

What each kind of dependency runs on. The **targeted** column is every scenario's acceptance test,
S1's included: it lives in the unit-test place and enters through the use case. The **walking
skeleton** column is the walking skeleton's alone.

| Dependency | Examples | Targeted scenario | Walking skeleton |
|---|---|---|---|
| Entry point | controller, CLI, UI, webhook received, topic consumed | in-process | real |
| Internal gateway | repository, database, cache | in-memory | Testcontainers |
| External gateway | REST, SOAP, GraphQL, gRPC, Kafka, RabbitMQ, MQTT, WebSocket, webhook sent | Microcks | Microcks |
| Clock, randomness | — | fake | fake |

A React front end:

| Dependency | Targeted tests | Playwright e2e |
|---|---|---|
| The back end it calls | MSW | Microcks |

- The plugin holds these defaults per stack. A component overrides a row with `infrastructure`
  in `skraft-config.json`, in the team file only; the external gateway row follows its
  `mocking.strategy`. The brief of the acceptance designer names each component's effective
  policy, and `skraft doctor` shows it with its source.
- Internal or external is ownership, not transport: a database the component owns is internal;
  an API, a broker topic or a webhook another team owns is external.
- Microcks runs from Testcontainers, the uber native image, **one container per test session**,
  started in the test runner's global setup (xUnit fixture, JUnit extension, pytest session
  fixture, Vitest or Playwright `globalSetup`): `mocking-microcks-<stack>`.
- Docker or Podman runs the containers. With neither: the scenario is INDETERMINATE and reported,
  never skipped, never replaced by a fake.

---

## Example — .NET walking skeleton

```csharp
// Walking skeleton of "Driver checks eligibility"
[Fact]
public async Task Eligibility_check_walks_the_real_path()
{
    // EligibilityApiFactory: WebApplicationFactory<Program> over the production composition root,
    // PostgreSQL from Testcontainers, the risk API from the session's Microcks container.
    var client = _factory.CreateClient();

    var response = await client.PostAsJsonAsync("/eligibility", new { driverId = "DRV-001" });

    response.StatusCode.Should().Be(HttpStatusCode.OK);
    var result = await response.Content.ReadFromJsonAsync<EligibilityResponse>();
    result!.DriverId.Should().Be("DRV-001");
}
```

Lives in `tests/Eligibility.IntegrationTest/`. S1's acceptance test, the binding of its Gherkin,
enters through `CheckEligibilityUseCase` in `tests/Eligibility.UnitTest/` with an in-memory
repository and asserts that the driver is eligible; so does every later scenario's.

---

## Checklist

- [ ] S1 is tagged `@walking-skeleton`, in a back-end component, or the exemption line holds
- [ ] The walking skeleton is a plain test in the integration-test place; S1 has its Cucumber binding in the unit-test place
- [ ] The walking skeleton sends what the entry point takes (request, command, message), not a use case call
- [ ] The use case and the internal gateways are the production ones; the database runs on Testcontainers
- [ ] External gateways and the clock run as the policy says, never on a hand-written fake
- [ ] The walking skeleton asserts the status, the shape and one value S1 names; no value the `.feature` lacks

---

## Anti-Patterns

| Anti-pattern | Problem |
|---|---|
| Walking skeleton that calls the use case | Proves no wiring: it is a targeted scenario |
| Walking skeleton on an in-memory repository | The real internal gateway is never run |
| An exemption the diff contradicts | Hides a path nothing proves |
| A second walking skeleton | The slow suite grows; every later scenario is targeted |
| Walking skeleton carrying the scenario's business assertions | Doubles S1's acceptance test on the slow path; the rule belongs to the Cucumber binding |
| Walking skeleton standing in for S1's acceptance test | S1's Gherkin runs nowhere; tag S1 `@walking-skeleton` and bind it like any scenario |
