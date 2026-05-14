# AsyncAPI Contract Workflow — Kafka & RabbitMQ Reference

## AsyncAPI 2.6.0 Minimal Structure

```yaml
asyncapi: 2.6.0
info:
  title: MonAssurance Events API
  version: 1.0.0
  description: Domain events published by the MonAssurance eligibility bounded context
defaultContentType: application/json
channels:
  eligibility.checked:
    description: Published when an eligibility check completes
    subscribe:
      operationId: onEligibilityChecked
      summary: Consume EligibilityChecked events
      message:
        $ref: "#/components/messages/EligibilityChecked"
    publish:
      operationId: publishEligibilityChecked
      summary: Publish EligibilityChecked event
      message:
        $ref: "#/components/messages/EligibilityChecked"
components:
  messages:
    EligibilityChecked:
      name: EligibilityChecked
      title: Eligibility check completed
      contentType: application/json
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
          example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        occurredAt:
          type: string
          format: date-time
        driverId:
          type: string
          example: "DRV-001"
        eligible:
          type: boolean
        reason:
          type: string
          nullable: true
          example: "UNDERAGE"
```

---

## Kafka Bindings

Add bindings at channel and/or server level.

```yaml
servers:
  kafka-local:
    url: localhost:9092
    protocol: kafka
    description: Local Kafka broker

channels:
  eligibility.checked:
    bindings:
      kafka:
        groupId:
          type: string
          const: eligibility-consumer-group
        clientId:
          type: string
          const: eligibility-checker
    subscribe:
      bindings:
        kafka:
          groupId:
            type: string
            const: eligibility-consumer-group
      message:
        $ref: "#/components/messages/EligibilityChecked"
```

---

## RabbitMQ Bindings

```yaml
servers:
  rabbitmq-local:
    url: amqp://localhost:5672
    protocol: amqp
    description: Local RabbitMQ broker

channels:
  eligibility.exchange/eligibility.checked:
    bindings:
      amqp:
        is: routingKey
        exchange:
          name: eligibility.exchange
          type: topic
          durable: true
          autoDelete: false
        queue:
          name: eligibility.checked
          durable: true
          autoDelete: false
          exclusive: false
    subscribe:
      operationId: onEligibilityChecked
      message:
        $ref: "#/components/messages/EligibilityChecked"
```

---

## Microcks Examples for AsyncAPI

Create `.apiexamples.yaml` alongside the AsyncAPI contract.

```yaml
apiVersion: mocks.microcks.io/v1alpha1
kind: APIExamples
metadata:
  name: "MonAssurance Events API - 1.0.0"
spec:
  examples:
    publishEligibilityChecked:
      "Eligible driver event":
        request:
          body: |
            {
              "eventId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
              "occurredAt": "2026-05-14T10:00:00Z",
              "driverId": "DRV-001",
              "eligible": true,
              "reason": null
            }
        response:
          code: 200

      "Ineligible driver event":
        request:
          body: |
            {
              "eventId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
              "occurredAt": "2026-05-14T10:01:00Z",
              "driverId": "DRV-YOUNG",
              "eligible": false,
              "reason": "UNDERAGE"
            }
        response:
          code: 200
```

---

## Consumer Test Pattern (.NET + Testcontainers)

```csharp
// Test: subscribe to topic → Microcks publishes test message → assert consumer received it

public class EligibilityEventConsumerTests : IAsyncLifetime
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

    [Fact]
    public async Task Consumer_processes_EligibilityChecked_event()
    {
        // Arrange — get Kafka bootstrap server from Microcks
        var kafkaBootstrap = _microcks.GetKafkaMockTopic(
            "MonAssurance Events API", "1.0.0", "eligibility.checked");

        var consumerConfig = new ConsumerConfig
        {
            BootstrapServers = kafkaBootstrap,
            GroupId = "test-consumer",
            AutoOffsetReset = AutoOffsetReset.Earliest
        };

        // Act — Microcks publishes the example message; consumer reads it
        using var consumer = new ConsumerBuilder<Ignore, string>(consumerConfig).Build();
        consumer.Subscribe("eligibility.checked");

        var received = consumer.Consume(TimeSpan.FromSeconds(5));

        // Assert
        Assert.NotNull(received);
        var payload = JsonSerializer.Deserialize<EligibilityCheckedPayload>(received.Message.Value);
        Assert.Equal("DRV-001", payload!.DriverId);
        Assert.True(payload.Eligible);
    }
}
```

---

## Producer Test Pattern (.NET + Testcontainers)

```csharp
// Test: trigger domain use case → assert event published on Kafka topic via VerifyAsync

public class EligibilityEventProducerTests : IAsyncLifetime
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

    [Fact]
    public async Task CheckEligibility_publishes_EligibilityChecked_event()
    {
        // Arrange
        var kafkaBootstrap = _microcks.GetKafkaMockTopic(
            "MonAssurance Events API", "1.0.0", "eligibility.checked");

        var useCase = new CheckEligibilityUseCase(
            new KafkaEventPublisher(kafkaBootstrap));

        // Act
        await useCase.ExecuteAsync(new CheckEligibilityCommand("DRV-001", driverAge: 35));

        // Assert — verify event was published and matches contract
        var result = await _microcks.VerifyAsync("MonAssurance Events API", "1.0.0");
        Assert.True(result.Success, string.Join("\n", result.Failures));
    }
}
```

---

## File Naming Convention

| Artifact | Path |
|---|---|
| AsyncAPI contract | `.skraft/sdlc/design/contracts/{name}-events.yaml` |
| Microcks examples | `.skraft/sdlc/distill/contracts/{name}-events.apiexamples.yaml` |
| Microcks metadata | `.skraft/sdlc/distill/contracts/{name}-events.apimetadata.yaml` |

---

## Supported Protocols in Microcks

| Protocol | AsyncAPI binding | Microcks support |
|---|---|---|
| Kafka | `kafka` | Full — mock + verify |
| RabbitMQ (AMQP) | `amqp` | Full — mock + verify |
| MQTT | `mqtt` | Full — mock + verify |
| WebSocket | `ws` | Mock only |
| HTTP SSE | — | Via REST mock |
