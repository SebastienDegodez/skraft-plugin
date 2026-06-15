---
name: contract-testing
description: >
  Use when authoring OpenAPI/AsyncAPI contracts, generating Microcks samples,
  setting up Testcontainers mocks, verifying provider contracts, or bridging
  API contracts across DESIGN → DISTILL → DELIVER phases.
---

# Contract Testing

## Overview

Contract-first API development spans three SDLC phases. Each phase produces specific artifacts consumed by the next.

```
DESIGN                      DISTILL                          DELIVER
OpenAPI / AsyncAPI    →     Microcks samples           →     Testcontainers mocks
contracts/{api}.yaml        .apiexamples.yaml                MicrocksContainer
                            .apimetadata.yaml                + TestEndpointAsync()
```

**Artifact path convention:**
- DESIGN  → `.copilot-tracking/skraft-plans/{projectSlug}/details/{date}/contracts/{api-name}.yaml`
- DISTILL → `.copilot-tracking/skraft-plans/{projectSlug}/details/{date}/contracts/{api-name}.apiexamples.yaml`
            `.copilot-tracking/skraft-plans/{projectSlug}/details/{date}/contracts/{api-name}.apimetadata.yaml`
- DELIVER → Testcontainers test class imports both DISTILL artifacts

**Core principle:** the contract is the source of truth. Implementation is verified against it, not the other way around.

---

## 1. Authoring API Contracts (DESIGN phase)

Write OpenAPI 3.1 contracts in YAML. Store at `.copilot-tracking/skraft-plans/{projectSlug}/details/{date}/contracts/{api-name}.yaml`.

**Required top-level structure:**
```yaml
openapi: 3.1.0
info:
  title: {Human Readable API Name}
  version: 1.0.0
  description: {One sentence purpose}
paths:
  /resource/{id}:
    get:
      operationId: getResourceById
      summary: {Brief summary}
      parameters: [...]
      responses:
        "200":
          description: Success
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ResourceResponse"
        "404":
          description: Not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
components:
  schemas:
    ResourceResponse:
      type: object
      required: [id, status]
      properties:
        id:
          type: string
        status:
          type: string
    ErrorResponse:
      type: object
      required: [code, message]
      properties:
        code:
          type: string
        message:
          type: string
```

**Versioning rules:**
- Increment `info.version` on any breaking change (removed field, changed type, removed operation).
- Non-breaking additions (new optional field, new operation) → minor version bump.
- Use `{api-name}-v{major}.yaml` for major version coexistence.

**File naming:** kebab-case, matching the bounded context and resource. Example: `eligibility-check-api.yaml`.

---

## 2. Generating Microcks Samples (DISTILL phase)

Produce two files per contract:

### `.apiexamples.yaml` — response examples per operation

```yaml
apiVersion: mocks.microcks.io/v1alpha1
kind: APIExamples
metadata:
  name: "{API Title} - {version}"
spec:
  examples:
    {operationId}:
      "{Example Name}":
        request:
          parameters:
            {paramName}: "{value}"
          body: |
            {JSON body if POST/PUT}
        response:
          code: 200
          headers:
            Content-Type: application/json
          body: |
            {
              "field": "value"
            }
```

**Rules:**
- `metadata.name` must match the `info.title` + `info.version` from the OpenAPI contract exactly.
- One entry per operationId; multiple named examples under each operationId are supported.
- `request.parameters` holds path and query params as string values.
- `response.code` is an integer.

### `.apimetadata.yaml` — dispatcher configuration

```yaml
apiVersion: mocks.microcks.io/v1alpha1
kind: APIMetadata
metadata:
  name: "{API Title} - {version}"
spec:
  operations:
    - name: "{HTTP_METHOD} /path/{param}"
      dispatcher: JSON_BODY | JS | GROOVY
      dispatcherRules: |
        {dispatcher-specific rules}
```

**Dispatcher selection:**
- `JSON_BODY` — route on a request body JSON field value. Use for simple request matching.
- `JS` — route using a JavaScript function. Use when routing logic is conditional or multi-field.
- `GROOVY` — route using Groovy DSL. Use for stateful mocks (in-memory counters, delay simulation).

**JSON_BODY dispatcher rules format:**
```
exp=$.fieldName cases=VALUE_A:ExampleName1&&VALUE_B:ExampleName2
```

**JS dispatcher rules format:**
```javascript
function dispatch(request) {
  var body = JSON.parse(request.body);
  if (body.field === "value") return "ExampleName";
  return "DefaultExample";
}
```

**GROOVY dispatcher rules format:**
```groovy
def body = new groovy.json.JsonSlurper().parseText(request.body)
if (body.field == "value") return "ExampleName"
return "DefaultExample"
```

---

## 3. Testcontainers Setup (DELIVER phase)

> **DELIVER wiring is stack-specific — resolve it through an adapter.** This skill
> owns the *generic, stack-agnostic* contract authoring (sections 1-2, 5-7) and
> the Microcks sample formats. The concrete DELIVER recipe (baseline
> `WebApplicationFactory` + `HttpClient`, plus the optional Microcks `VerifyAsync`
> layer) is owned per stack by the `contract-testing-<stack>` adapter, resolved
> via [contract-testing-roster](../contract-testing-roster/SKILL.md). For .NET see
> [contract-testing-dotnet](../contract-testing-dotnet/SKILL.md). The .NET snippets
> below remain as the canonical reference those adapters point back to.

Use the `Microcks.Testcontainers` NuGet package (it brings `DotNet.Testcontainers`
transitively — do not also reference the unrelated `Testcontainers`/`TestContainers`
packages).

**NuGet packages:**
```
Microcks.Testcontainers
```

**Real 0.3.4 API (used by every snippet below):**
- `new MicrocksBuilder()...Build()` returns the container; then `await container.StartAsync()`. There is no `BuildAsync()`.
- `WithMainArtifacts(params string[])` loads the schema + examples + metadata in ONE call (schema first). There is no singular `WithMainArtifact`.
- `container.GetRestMockEndpoint("API Title", "1.0.0")` returns a `Uri` (mock base URL). There is no `GetRestMockUrl`.
- Provider conformance is `container.TestEndpointAsync(TestRequest{ OPEN_API_SCHEMA })` (§4). `VerifyAsync(name, version)` returns a `bool` checking mock-invocation counts — a consumer-side concern, not conformance.

**Consumer-side mock setup (IAsyncLifetime) — mock a downstream dependency:**
```csharp
public class EligibilityApiTests : IAsyncLifetime
{
    private MicrocksContainer _microcks = null!;

    public async Task InitializeAsync()
    {
        _microcks = new MicrocksBuilder()
            .WithMainArtifacts(
                "contracts/eligibility-check-api.yaml",
                "contracts/eligibility-check-api.apiexamples.yaml",
                "contracts/eligibility-check-api.apimetadata.yaml")
            .Build();
        await _microcks.StartAsync();
    }

    public async Task DisposeAsync() => await _microcks.DisposeAsync();

    [Fact]
    public async Task Should_return_eligible_driver()
    {
        Uri mockUrl = _microcks.GetRestMockEndpoint("Eligibility Check API", "1.0.0");
        // use mockUrl as the base address of the SUT's downstream HttpClient
    }
}
```

**WebApplicationFactory integration (consumer-side — point the SUT's downstream client at the mock):**
```csharp
public class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private MicrocksContainer _microcks = null!;

    public async Task InitializeAsync()
    {
        _microcks = new MicrocksBuilder()
            .WithMainArtifacts(
                "contracts/eligibility-check-api.yaml",
                "contracts/eligibility-check-api.apiexamples.yaml")
            .Build();
        await _microcks.StartAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            // Point the SUT's DOWNSTREAM client at the Microcks mock endpoint.
            Uri mockUrl = _microcks.GetRestMockEndpoint("Eligibility Check API", "1.0.0");
            services.AddHttpClient<IEligibilityClient, EligibilityClient>(
                c => c.BaseAddress = mockUrl);
        });
    }

    public async Task DisposeAsync()
    {
        await _microcks.DisposeAsync();
        await base.DisposeAsync();
    }
}
```

> A `WebApplicationFactory` works for consumer-side mocking (above) because the
> SUT calls OUT to the mock. It does NOT work for provider conformance (§4): that
> needs Microcks to call IN to the SUT on a real TCP port, which an in-memory test
> server does not expose.

**Collection fixture for shared Microcks instance (multiple test classes):**
```csharp
[CollectionDefinition("Microcks")]
public class MicrocksCollection : ICollectionFixture<MicrocksFixture> { }

public class MicrocksFixture : IAsyncLifetime
{
    public MicrocksContainer Container { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        Container = new MicrocksBuilder()
            .WithMainArtifacts(
                "contracts/eligibility-check-api.yaml",
                "contracts/eligibility-check-api.apiexamples.yaml")
            .Build();
        await Container.StartAsync();
    }

    public async Task DisposeAsync() => await Container.DisposeAsync();
}
```

---

## 4. Contract Verification (provider-side conformance)

Use `TestEndpointAsync` with the `OPEN_API_SCHEMA` runner to assert your running
implementation satisfies the contract. Microcks calls IN to your service, so the
service must listen on a real TCP port (boot real Kestrel — a `WebApplicationFactory`
exposes none). The concrete .NET wiring lives in
[contract-testing-dotnet](../contract-testing-dotnet/SKILL.md).

```csharp
var request = new TestRequest
{
    ServiceId = "Eligibility Check API:1.0.0",   // "info.title:info.version"
    RunnerType = TestRunnerType.OPEN_API_SCHEMA,
    TestEndpoint = $"http://host.testcontainers.internal:{port}",
    Timeout = TimeSpan.FromSeconds(5),
};

TestResult result = await microcks.TestEndpointAsync(request);
Assert.True(result.Success);   // do not suppress a failing TestResult
```

**TestResult properties:**
- `result.Success` → `bool` — true only when every replayed example passed.
- `result.TestCaseResults` → per-operation detail for diagnosing a failure.

**What "verified" means:** every example in `.apiexamples.yaml` was replayed
against your running service; all response codes, headers, and body fields matched.

> Do NOT use `VerifyAsync(name, version)` for conformance — it returns a `bool`
> that checks how many times a MOCK endpoint was invoked (a consumer-side
> assertion), not whether the provider matches the contract.

**CI gate rule:** call `TestEndpointAsync` in a dedicated test and fail the build
if `result.Success == false`. Do not suppress failures.

---

## 5. AsyncAPI Contracts (Kafka / RabbitMQ)

Write AsyncAPI 2.6.0 contracts. Store at `.copilot-tracking/skraft-plans/{projectSlug}/details/{date}/contracts/{event-name}-events.yaml`.

**Required structure:**
```yaml
asyncapi: 2.6.0
info:
  title: {Event API Title}
  version: 1.0.0
channels:
  {topic-or-queue-name}:
    subscribe:
      operationId: on{EventName}
      message:
        $ref: "#/components/messages/{EventName}"
    publish:
      operationId: publish{EventName}
      message:
        $ref: "#/components/messages/{EventName}"
components:
  messages:
    {EventName}:
      name: {EventName}
      payload:
        type: object
        required: [eventId, occurredAt]
        properties:
          eventId:
            type: string
            format: uuid
          occurredAt:
            type: string
            format: date-time
```

**Kafka bindings:**
```yaml
channels:
  eligibility.checked:
    bindings:
      kafka:
        groupId: eligibility-consumer-group
        clientId: eligibility-checker
```

**Consumer test pattern:** subscribe to topic → publish test message via Microcks → assert message received by consumer.

**Producer test pattern:** trigger use case → assert event published on topic via Microcks verification.

---

## 6. Artifact Bridging

Artifacts flow from DESIGN → DISTILL → DELIVER following this convention:

| Phase | Artifact | Path |
|---|---|---|
| DESIGN | OpenAPI contract | `.copilot-tracking/skraft-plans/{projectSlug}/details/{date}/contracts/{name}.yaml` |
| DESIGN | AsyncAPI contract | `.copilot-tracking/skraft-plans/{projectSlug}/details/{date}/contracts/{name}-events.yaml` |
| DISTILL | Microcks examples | `.copilot-tracking/skraft-plans/{projectSlug}/details/{date}/contracts/{name}.apiexamples.yaml` |
| DISTILL | Microcks metadata | `.copilot-tracking/skraft-plans/{projectSlug}/details/{date}/contracts/{name}.apimetadata.yaml` |
| DELIVER | Test imports | Via `MicrocksBuilder.WithMainArtifacts(...)` referencing DISTILL artifacts |

**Import order for `WithMainArtifacts`:** pass the OpenAPI/AsyncAPI contract first (schema), then the `.apiexamples.yaml` (examples), then the `.apimetadata.yaml` (dispatcher config) — all in a single call.

**Version bump protocol:**
1. Update `info.version` in the contract YAML.
2. Update `metadata.name` in both DISTILL artifacts to match (`{info.title} - {info.version}`).
3. Update the `ServiceId = "{title}:{version}"` in `TestEndpointAsync` calls.
4. Commit all three changes atomically.

---

## 7. Multi-service Testing

Use `MicrocksContainerEnsemble` when the service under test calls multiple downstream APIs.

```csharp
var network = new NetworkBuilder().Build();
var ensemble = new MicrocksContainerEnsemble(network, "quay.io/microcks/microcks-uber:1.14.0-native")
    .WithMainArtifacts(
        "contracts/eligibility-check-api.apiexamples.yaml",
        "contracts/driver-profile-api.apiexamples.yaml");
await ensemble.StartAsync();

Uri eligibilityMockUrl = ensemble.MicrocksContainer.GetRestMockEndpoint("Eligibility Check API", "1.0.0");
Uri driverMockUrl = ensemble.MicrocksContainer.GetRestMockEndpoint("Driver Profile API", "1.0.0");
```

**Docker Compose variant:** supply a `docker-compose.yaml` with dependent services and pass it to the ensemble builder for full integration environment startup.

---

## 8. References

- [references/microcks-testcontainers-setup.md](references/microcks-testcontainers-setup.md) — Full .NET setup, MicrocksBuilder API, collection fixtures
- [references/openapi-samples-authoring.md](references/openapi-samples-authoring.md) — `.apiexamples.yaml` full spec, all dispatcher types, templating
- [references/asyncapi-contract-workflow.md](references/asyncapi-contract-workflow.md) — AsyncAPI 2.6.0 snippets, Kafka/RabbitMQ bindings, consumer/producer tests
- [references/contract-verification.md](references/contract-verification.md) — `TestEndpointAsync()` patterns, `TestResult`, CI gate integration
- [references/dispatchers-reference.md](references/dispatchers-reference.md) — JSON_BODY, JS, Groovy dispatcher full reference
- [references/artifact-bridging.md](references/artifact-bridging.md) — Convention table, naming rules, version bump protocol

**Examples:**
- [examples/01-openapi-json-body.md](examples/01-openapi-json-body.md) — GET eligibility, JSON_BODY dispatcher, 200/404
- [examples/02-openapi-js-dispatcher.md](examples/02-openapi-js-dispatcher.md) — POST eligibility, JS dispatcher, age-based routing
- [examples/03-testcontainers-dotnet.md](examples/03-testcontainers-dotnet.md) — Complete xUnit test class with WebApplicationFactory
- [examples/04-asyncapi-kafka.md](examples/04-asyncapi-kafka.md) — EligibilityChecked event, consumer + producer tests
