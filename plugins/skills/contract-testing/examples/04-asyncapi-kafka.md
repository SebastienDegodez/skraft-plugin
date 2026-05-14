# Example 04 — AsyncAPI Kafka Contract for EligibilityChecked Event

**Pattern:** AsyncAPI 2.6.0 contract for the `EligibilityChecked` domain event published to a Kafka topic. Consumer test and producer test using Microcks Testcontainers.

---

## AsyncAPI Contract

```yaml
# .skraft/sdlc/design/contracts/monassurance-events-api.yaml
asyncapi: 2.6.0
info:
  title: MonAssurance Events API
  version: 1.0.0
  description: >
    Domain events published by the MonAssurance eligibility bounded context.
    Consumers subscribe to these events to react to eligibility check outcomes.

defaultContentType: application/json

servers:
  kafka-local:
    url: localhost:9092
    protocol: kafka
    description: Local Kafka broker (Testcontainers or docker-compose)

channels:
  eligibility.checked:
    description: >
      Published whenever an eligibility check completes, regardless of outcome.
      One event per check request.
    bindings:
      kafka:
        groupId:
          type: string
          const: eligibility-consumer-group
    subscribe:
      operationId: onEligibilityChecked
      summary: Receive EligibilityChecked events
      message:
        $ref: "#/components/messages/EligibilityChecked"
    publish:
      operationId: publishEligibilityChecked
      summary: Publish EligibilityChecked event after a check completes
      message:
        $ref: "#/components/messages/EligibilityChecked"

components:
  messages:
    EligibilityChecked:
      name: EligibilityChecked
      title: Eligibility check completed
      summary: Raised when a driver's eligibility has been determined
      contentType: application/json
      headers:
        type: object
        properties:
          correlationId:
            type: string
            format: uuid
            description: Traces the request that triggered this event
          eventType:
            type: string
            const: EligibilityChecked
      payload:
        $ref: "#/components/schemas/EligibilityCheckedPayload"

  schemas:
    EligibilityCheckedPayload:
      type: object
      required: [eventId, occurredAt, driverId, eligible]
      properties:
        eventId:
          type: string
          format: uuid
          description: Unique identifier for this event instance
          example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        occurredAt:
          type: string
          format: date-time
          description: When the eligibility check completed (UTC)
          example: "2026-05-14T10:00:00Z"
        driverId:
          type: string
          description: MonAssurance driver identifier
          example: "DRV-001"
        eligible:
          type: boolean
          description: Whether the driver is eligible for a policy
        reason:
          type: string
          nullable: true
          description: Rejection reason code when eligible=false
          enum: [UNDERAGE, SUSPENDED_LICENSE, HIGH_RISK_ZONE, null]
        surcharge:
          type: number
          format: double
          nullable: true
          description: Additional premium percentage when eligible=true (0.0 = none)
          example: 0.25
```

---

## Microcks Examples

```yaml
# .skraft/sdlc/distill/contracts/monassurance-events-api.apiexamples.yaml
apiVersion: mocks.microcks.io/v1alpha1
kind: APIExamples
metadata:
  name: "MonAssurance Events API - 1.0.0"
spec:
  examples:
    publishEligibilityChecked:
      "Eligible driver event":
        # Published when an adult driver passes the check
        request:
          body: |
            {
              "eventId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
              "occurredAt": "2026-05-14T10:00:00Z",
              "driverId": "DRV-001",
              "eligible": true,
              "reason": null,
              "surcharge": 0.0
            }
        response:
          code: 200

      "Underage driver event":
        # Published when a driver under 18 fails the check
        request:
          body: |
            {
              "eventId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
              "occurredAt": "2026-05-14T10:01:00Z",
              "driverId": "DRV-YOUNG",
              "eligible": false,
              "reason": "UNDERAGE",
              "surcharge": null
            }
        response:
          code: 200

      "Young driver event with surcharge":
        # Published when a 22-year-old passes with surcharge
        request:
          body: |
            {
              "eventId": "c3d4e5f6-a7b8-9012-cdef-123456789012",
              "occurredAt": "2026-05-14T10:02:00Z",
              "driverId": "DRV-JEUNE",
              "eligible": true,
              "reason": null,
              "surcharge": 0.25
            }
        response:
          code: 200
```

---

## Consumer Test

```csharp
// tests/MonAssurance.IntegrationTests/Tests/EligibilityEventConsumerTests.cs
// Pattern: Microcks publishes example events → consumer processes them → assert state

using Confluent.Kafka;
using Microcks.Testcontainers;

namespace MonAssurance.IntegrationTests.Tests;

public sealed class EligibilityEventConsumerTests : IAsyncLifetime
{
    private MicrocksContainer _microcks = null!;

    public async Task InitializeAsync()
    {
        _microcks = await new MicrocksBuilder()
            .WithMainArtifact("contracts/monassurance-events-api.yaml")
            .WithMainArtifact("contracts/monassurance-events-api.apiexamples.yaml")
            .BuildAsync();
    }

    public async Task DisposeAsync() => await _microcks.DisposeAsync();

    [Fact(DisplayName = "Consumer reads EligibilityChecked event from Kafka topic")]
    public async Task Consumer_reads_eligibility_checked_event()
    {
        // Arrange — Microcks provides a Kafka mock topic
        // GetKafkaMockTopic returns the bootstrap server address for the mock topic
        var bootstrapServer = _microcks.GetKafkaMockTopic(
            "MonAssurance Events API",
            "1.0.0",
            "eligibility.checked");

        var config = new ConsumerConfig
        {
            BootstrapServers = bootstrapServer,
            GroupId = $"test-consumer-{Guid.NewGuid()}",  // unique per test run
            AutoOffsetReset = AutoOffsetReset.Earliest,
            EnableAutoCommit = false
        };

        using var consumer = new ConsumerBuilder<Ignore, string>(config).Build();
        consumer.Subscribe("eligibility.checked");

        // Act — consume up to 3 messages (one per example)
        var messages = new List<string>();
        var deadline = DateTime.UtcNow.AddSeconds(10);

        while (messages.Count < 3 && DateTime.UtcNow < deadline)
        {
            var result = consumer.Consume(TimeSpan.FromSeconds(1));
            if (result is not null)
                messages.Add(result.Message.Value);
        }

        consumer.Close();

        // Assert — at least the "Eligible driver event" example was consumed
        Assert.NotEmpty(messages);

        var eligibleEvent = messages
            .Select(m => JsonSerializer.Deserialize<EligibilityCheckedPayload>(m,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true }))
            .FirstOrDefault(e => e?.DriverId == "DRV-001");

        Assert.NotNull(eligibleEvent);
        Assert.True(eligibleEvent!.Eligible);
        Assert.Equal("DRV-001", eligibleEvent.DriverId);
        Assert.Equal(0.0, eligibleEvent.Surcharge);
    }
}
```

---

## Producer Test

```csharp
// tests/MonAssurance.IntegrationTests/Tests/EligibilityEventProducerTests.cs
// Pattern: trigger use case → assert event published on Kafka → verify via VerifyAsync

namespace MonAssurance.IntegrationTests.Tests;

public sealed class EligibilityEventProducerTests : IAsyncLifetime
{
    private MicrocksContainer _microcks = null!;

    public async Task InitializeAsync()
    {
        _microcks = await new MicrocksBuilder()
            .WithMainArtifact("contracts/monassurance-events-api.yaml")
            .WithMainArtifact("contracts/monassurance-events-api.apiexamples.yaml")
            .BuildAsync();
    }

    public async Task DisposeAsync() => await _microcks.DisposeAsync();

    [Fact(DisplayName = "CheckEligibility use case publishes EligibilityChecked event")]
    public async Task CheckEligibility_publishes_event_matching_contract()
    {
        // Arrange — wire the use case to publish to the Microcks Kafka mock
        var bootstrapServer = _microcks.GetKafkaMockTopic(
            "MonAssurance Events API",
            "1.0.0",
            "eligibility.checked");

        var publisher = new KafkaEventPublisher(bootstrapServer, "eligibility.checked");
        var useCase = new CheckEligibilityUseCase(
            new InMemoryDriverRepository(new Driver("DRV-001", age: 35)),
            publisher);

        // Act
        await useCase.ExecuteAsync(new CheckEligibilityCommand(
            DriverId: "DRV-001",
            VehicleType: "CAR",
            PostalCode: "75001"));

        // Allow Kafka message to propagate
        await Task.Delay(500);

        // Assert — VerifyAsync checks that published event matches contract examples
        var result = await _microcks.VerifyAsync(
            "MonAssurance Events API",
            "1.0.0",
            timeout: TimeSpan.FromSeconds(10));

        Assert.True(result.Success, string.Join("\n", result.Failures));
    }
}
```

---

## Supporting Types (stubs for compilation context)

```csharp
// Domain model
public record Driver(string Id, int Age);
public record CheckEligibilityCommand(string DriverId, string VehicleType, string PostalCode);

// Event payload — mirrors AsyncAPI schema
public record EligibilityCheckedPayload(
    string EventId,
    DateTime OccurredAt,
    string DriverId,
    bool Eligible,
    string? Reason,
    double? Surcharge);

// Infrastructure — Kafka publisher (simplified)
public class KafkaEventPublisher(string bootstrapServers, string topic)
{
    public async Task PublishAsync(EligibilityCheckedPayload payload)
    {
        var config = new ProducerConfig { BootstrapServers = bootstrapServers };
        using var producer = new ProducerBuilder<Null, string>(config).Build();

        var json = JsonSerializer.Serialize(payload,
            new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });

        await producer.ProduceAsync(topic,
            new Message<Null, string> { Value = json });
    }
}
```

---

## Design Notes

- **`GetKafkaMockTopic` vs `GetRestMockUrl`:** Kafka contracts use `GetKafkaMockTopic(apiName, version, channelName)`. The channel name matches the key under `channels:` in the AsyncAPI spec.
- **Consumer test:** validates the consumer's parsing and handling logic against Microcks-published examples. Does not test the producer.
- **Producer test:** validates that the application produces events conforming to the contract. `VerifyAsync` compares the published message to the AsyncAPI examples.
- **Unique GroupId per test:** avoids offset conflicts when tests run in parallel or are re-run without container restart.
- **`await Task.Delay(500)`:** Kafka message propagation requires a short wait before `VerifyAsync`. In CI, increase this to 1–2 seconds if flakiness occurs.
- **`Confluent.Kafka` NuGet:** add `Confluent.Kafka` to the test project for `ConsumerBuilder` and `ProducerBuilder`.
