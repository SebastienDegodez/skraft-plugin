---
name: mocking-microcks-dotnet
description: 'Use when a .NET component''s brief line says `mocking: microcks` (the default) and a test must mock a downstream dependency (an external gateway). Provides the Microcks Testcontainers wiring, one uber native container per test session in an xUnit assembly or collection fixture, the WebApplicationFactory scaffold that points the system-under-test''s typed HttpClient at the mock URL, and the Docker or Podman setup.'
---

# Mocking — Microcks x .NET (default)

Mocks a downstream dependency the SUT calls with a Microcks container seeded from that
dependency's OpenAPI/examples contract. Applies to a .NET component whose brief line says
`mocking: microcks`, in every test the infrastructure policy runs the external gateway on Microcks
(targeted scenarios and walking skeleton). Write mock wiring and the test scaffold only;
provider contract verification belongs to `contract-testing`.

## NuGet packages

```
Microcks.Testcontainers
Testcontainers
```

## Recipe — one container per test session

Start Microcks once per test assembly, in an xUnit v3 assembly fixture; with xUnit v2, the same
class is an `ICollectionFixture<MicrocksFixture>` of a `[CollectionDefinition("Microcks")]` that
every test class joins with `[Collection("Microcks")]`. Never start one per test class.

```csharp
[assembly: AssemblyFixture(typeof(MicrocksFixture))]

public sealed class MicrocksFixture : IAsyncLifetime
{
    private const string Image = "quay.io/microcks/microcks-uber:1.14.0-native";

    // Seed mocks from the DOWNSTREAM dependency's contract (not our API).
    public MicrocksContainer Container { get; } = new MicrocksBuilder()
        .WithImage(Image)
        .WithMainArtifacts("resources/third-parties/{downstream-api}-openapi.yaml")
        .Build();

    public ValueTask InitializeAsync() => new(Container.StartAsync());

    public ValueTask DisposeAsync() => Container.DisposeAsync();
}
```

The real API is `GetRestMockEndpoint(serviceName, version)` (`+` encodes a space in the service
name, e.g. `"API+Pastries"`).

- **Targeted scenario** (unit-test place): hand the use case the real HTTP gateway built on
  `fixture.Container.GetRestMockEndpoint("{Downstream+API+Name}", "1.0.0")`.
- **Walking skeleton / API test** (integration-test place): point the host's client at it.

```csharp
public sealed class {Sut}WebApplicationFactory(MicrocksFixture microcks) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var endpoint = microcks.Container.GetRestMockEndpoint("{Downstream+API+Name}", "1.0.0");
        builder.UseSetting("{Downstream}Api:BaseUrl", $"{endpoint}");
    }
}
```

To assert the mock was actually hit, use `VerifyAsync("{Downstream+API+Name}", "1.0.0")` or
`GetServiceInvocationsCountAsync(...)` on the container.

Files: `tests/{Sut}.{Unit|Integration}Test/MicrocksFixture.cs`, beside the tests that use it.

## Docker or Podman

Testcontainers finds Docker by itself. Podman is reached once the developer sets, outside the
tests (`~/.testcontainers.properties` or the environment):

| OS | Podman |
|---|---|
| macOS | `podman machine start`; `docker.host` / `DOCKER_HOST` = `unix://` + the path `podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}'` prints; `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock` |
| Linux | `systemctl --user enable --now podman.socket`; `DOCKER_HOST` = `unix://` + the path `podman info --format '{{.Host.RemoteSocket.Path}}'` prints |
| Windows | `podman machine start`; `DOCKER_HOST=npipe:////./pipe/podman-machine-default` |

Rootless Podman: `TESTCONTAINERS_RYUK_DISABLED=true`; rootful: `TESTCONTAINERS_RYUK_CONTAINER_PRIVILEGED=true`.

## Rules

- Mock the DOWNSTREAM dependency, never the SUT itself.
- One Microcks container per test session, in the assembly or collection fixture.
- `VerifyAsync` / `GetServiceInvocationsCountAsync` only ASSERT the mock was used; they are not
  provider contract verification (that is a separate capability).
- No Docker or Podman answers: never skip the test, never put a fake in its place; let the
  container start fail and stop, blocked, naming the component (the scenario is INDETERMINATE).
