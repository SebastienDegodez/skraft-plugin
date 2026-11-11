# Walking Skeleton and Infrastructure Policy

## Definition

The walking skeleton is S1 of every story: the thinnest slice that runs the **real path**, from the
component's entry point through the use case to its real internal gateways. It proves the wiring
before any other scenario adds behaviour. It is not a feature test: one happy path, hardcoded
values where the story allows, no error handling beyond what the test needs.

- One per story, tagged `@walking-skeleton` in the `.feature` and in the test plan's
  `## Scenarios` table, always S1.
- In a back-end component; a React front end has none (its end-to-end run is Playwright's).
- Its acceptance test lives in the component's integration-test place and drives the real entry
  point the story adds or changes, wired by the production composition root.

---

## Exemptions

A story with no new path to prove declares it under the `## Scenarios` table and tags no scenario
`@walking-skeleton`; S1 is then a targeted scenario like the others.

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

What each kind of dependency runs on. A **targeted scenario** is every scenario but the walking
skeleton: it lives in the unit-test place and enters through the use case.

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
// Driver checks eligibility
[Fact]
public async Task Driver_checks_eligibility()
{
    // EligibilityApiFactory: WebApplicationFactory<Program> over the production composition root,
    // PostgreSQL from Testcontainers, the risk API from the session's Microcks container.
    var client = _factory.CreateClient();

    var response = await client.PostAsJsonAsync("/eligibility", new { driverId = "DRV-001" });

    var result = await response.Content.ReadFromJsonAsync<EligibilityResponse>();
    result!.Eligible.Should().BeTrue();
}
```

Lives in `tests/Eligibility.IntegrationTest/`. Every later scenario of the story enters through
`CheckEligibilityUseCase` in `tests/Eligibility.UnitTest/`, with an in-memory repository.

---

## Checklist

- [ ] S1 is tagged `@walking-skeleton`, in a back-end component, or the exemption line holds
- [ ] The test sends what the entry point takes (request, command, message), not a use case call
- [ ] The use case and the internal gateways are the production ones; the database runs on Testcontainers
- [ ] External gateways and the clock run as the policy says, never on a hand-written fake
- [ ] The test asserts the business outcome the entry point returns or the state it leaves

---

## Anti-Patterns

| Anti-pattern | Problem |
|---|---|
| Walking skeleton that calls the use case | Proves no wiring: it is a targeted scenario |
| Walking skeleton on an in-memory repository | The real internal gateway is never run |
| An exemption the diff contradicts | Hides a path nothing proves |
| A second walking skeleton | The slow suite grows; every later scenario is targeted |
