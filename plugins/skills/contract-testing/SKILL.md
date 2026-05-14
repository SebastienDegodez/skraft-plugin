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
                            .apimetadata.yaml                + VerifyAsync()
```

**Artifact path convention:**
- DESIGN  → `.skraft/sdlc/design/contracts/{api-name}.yaml`
- DISTILL → `.skraft/sdlc/distill/contracts/{api-name}.apiexamples.yaml`
            `.skraft/sdlc/distill/contracts/{api-name}.apimetadata.yaml`
- DELIVER → Testcontainers test class imports both DISTILL artifacts

**Core principle:** the contract is the source of truth. Implementation is verified against it, not the other way around.

---

## 1. Authoring API Contracts (DESIGN phase)

Write OpenAPI 3.1 contracts in YAML. Store at `.skraft/sdlc/design/contracts/{api-name}.yaml`.

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

Use the `Microcks.Testcontainers` NuGet package.

**NuGet packages:**
```
Microcks.Testcontainers
Testcontainers
```

**Single-service setup (IAsyncLifetime):**
```csharp
public class EligibilityApiTests : IAsyncLifetime
{
    private MicrocksContainer _microcks = null!;

    public async Task InitializeAsync()
    {
        _microcks = await new MicrocksBuilder()
            .WithMainArtifact("contracts/eligibility-check-api.yaml")
            .WithMainArtifact("contracts/eligibility-check-api.apiexamples.yaml")
            .BuildAsync();
    }

    public async Task DisposeAsync() => await _microcks.DisposeAsync();

    [Fact]
    public async Task Should_return_eligible_driver()
    {
        var mockUrl = _microcks.GetRestMockUrl("Eligibility Check API", "1.0.0");
        // use mockUrl as base address in HttpClient
    }
}
```

**WebApplicationFactory integration:**
```csharp
public class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private MicrocksContainer _microcks = null!;

    public async Task InitializeAsync()
    {
        _microcks = await new MicrocksBuilder()
            .WithMainArtifact("contracts/eligibility-check-api.apiexamples.yaml")
            .BuildAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            // Replace real HTTP client with Microcks mock URL
            var mockUrl = _microcks.GetRestMockUrl("Eligibility Check API", "1.0.0");
            services.AddHttpClient<IEligibilityClient, EligibilityClient>(
                c => c.BaseAddress = new Uri(mockUrl));
        });
    }

    public async Task DisposeAsync()
    {
        await _microcks.DisposeAsync();
        await base.DisposeAsync();
    }
}
```

**Collection fixture for shared Microcks instance (multiple test classes):**
```csharp
[CollectionDefinition("Microcks")]
public class MicrocksCollection : ICollectionFixture<MicrocksFixture> { }

public class MicrocksFixture : IAsyncLifetime
{
    public MicrocksContainer Container { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        Container = await new MicrocksBuilder()
            .WithMainArtifact("contracts/eligibility-check-api.apiexamples.yaml")
            .BuildAsync();
    }

    public async Task DisposeAsync() => await Container.DisposeAsync();
}
```

---

## 4. Contract Verification

Use `VerifyAsync()` to assert your implementation satisfies the contract.

```csharp
var result = await _microcks.VerifyAsync("Eligibility Check API", "1.0.0");
Assert.True(result.Success, string.Join("\n", result.Failures));
```

**TestResult properties:**
- `result.Success` → `bool` — true only when all contract operations pass.
- `result.Failures` → `IList<string>` — descriptions of each failing assertion.

**What "verified" means:** every example in `.apiexamples.yaml` was replayed against your running service; all response codes, headers, and body fields matched.

**CI gate rule:** call `VerifyAsync` in a dedicated test and fail the build if `result.Success == false`. Do not suppress failures.

---

## 5. AsyncAPI Contracts (Kafka / RabbitMQ)

Write AsyncAPI 2.6.0 contracts. Store at `.skraft/sdlc/design/contracts/{event-name}-events.yaml`.

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
| DESIGN | OpenAPI contract | `.skraft/sdlc/design/contracts/{name}.yaml` |
| DESIGN | AsyncAPI contract | `.skraft/sdlc/design/contracts/{name}-events.yaml` |
| DISTILL | Microcks examples | `.skraft/sdlc/distill/contracts/{name}.apiexamples.yaml` |
| DISTILL | Microcks metadata | `.skraft/sdlc/distill/contracts/{name}.apimetadata.yaml` |
| DELIVER | Test imports | Via `MicrocksBuilder.WithMainArtifact(path)` referencing DISTILL artifacts |

**Import order for MicrocksBuilder:** always load the OpenAPI/AsyncAPI contract first (schema), then the `.apiexamples.yaml` (examples), then the `.apimetadata.yaml` (dispatcher config).

**Version bump protocol:**
1. Update `info.version` in the contract YAML.
2. Update `metadata.name` in both DISTILL artifacts to match.
3. Update `VerifyAsync("Name", "version")` calls in tests.
4. Commit all three changes atomically.

---

## 7. Multi-service Testing

Use `MicrocksContainersEnsemble` when the service under test calls multiple downstream APIs.

```csharp
var ensemble = await new MicrocksContainersEnsembleBuilder()
    .WithMainArtifact("contracts/eligibility-check-api.apiexamples.yaml")
    .WithMainArtifact("contracts/driver-profile-api.apiexamples.yaml")
    .BuildAsync();

var eligibilityMockUrl = ensemble.GetRestMockUrl("Eligibility Check API", "1.0.0");
var driverMockUrl = ensemble.GetRestMockUrl("Driver Profile API", "1.0.0");
```

**Docker Compose variant:** supply a `docker-compose.yaml` with dependent services and pass it to the ensemble builder for full integration environment startup.

---

## 8. References

- [references/microcks-testcontainers-setup.md](references/microcks-testcontainers-setup.md) — Full .NET setup, MicrocksBuilder API, collection fixtures
- [references/openapi-samples-authoring.md](references/openapi-samples-authoring.md) — `.apiexamples.yaml` full spec, all dispatcher types, templating
- [references/asyncapi-contract-workflow.md](references/asyncapi-contract-workflow.md) — AsyncAPI 2.6.0 snippets, Kafka/RabbitMQ bindings, consumer/producer tests
- [references/contract-verification.md](references/contract-verification.md) — `VerifyAsync()` patterns, TestResult, CI gate integration
- [references/dispatchers-reference.md](references/dispatchers-reference.md) — JSON_BODY, JS, Groovy dispatcher full reference
- [references/artifact-bridging.md](references/artifact-bridging.md) — Convention table, naming rules, version bump protocol

**Examples:**
- [examples/01-openapi-json-body.md](examples/01-openapi-json-body.md) — GET eligibility, JSON_BODY dispatcher, 200/404
- [examples/02-openapi-js-dispatcher.md](examples/02-openapi-js-dispatcher.md) — POST eligibility, JS dispatcher, age-based routing
- [examples/03-testcontainers-dotnet.md](examples/03-testcontainers-dotnet.md) — Complete xUnit test class with WebApplicationFactory
- [examples/04-asyncapi-kafka.md](examples/04-asyncapi-kafka.md) — EligibilityChecked event, consumer + producer tests
