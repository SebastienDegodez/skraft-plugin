---
name: design-mocking-microcks-java
description: 'Use when a Java component''s brief line says `mocking: microcks` (the default) and a test must mock a downstream dependency (an external gateway). Provides the Microcks Testcontainers wiring, one uber native container per test JVM started by a holder class, the Spring Boot `@DynamicPropertySource` or Quarkus test resource that points the system-under-test''s HTTP client at the mock URL, and the Docker or Podman setup.'
---

# Mocking — Microcks x Java (default)

Mocks a downstream dependency the SUT calls with a Microcks container seeded from that
dependency's OpenAPI/examples contract. Applies to a Java component whose brief line says
`mocking: microcks`, in every test the infrastructure policy runs the external gateway on Microcks
(targeted scenarios and walking skeleton). Write mock wiring and the test scaffold only.

## Test dependencies

```xml
<dependency>
  <groupId>io.github.microcks</groupId>
  <artifactId>microcks-testcontainers</artifactId>
  <version>0.5.1</version>
  <scope>test</scope>
</dependency>
```

Testcontainers itself comes with it; a Spring Boot component adds `spring-boot-testcontainers`
only when its pom already manages Testcontainers through the Boot BOM.

## Recipe — one container per test JVM

A holder class starts the container once, in a static initializer; never one container per test
class, never `@Container` on a test class field.

```java
// src/test/java/{package}/support/MicrocksHolder.java
public final class MicrocksHolder {
    private static final DockerImageName IMAGE = DockerImageName.parse("quay.io/microcks/microcks-uber:1.14.0-native");

    public static final MicrocksContainer MICROCKS = new MicrocksContainer(IMAGE)
            // Seed mocks from the DOWNSTREAM dependency's contract (not our API).
            .withMainArtifacts("third-parties/{downstream-api}-openapi.yaml");

    static {
        MICROCKS.start();
    }

    public static String downstreamUrl() {
        return MICROCKS.getRestMockEndpoint("{Downstream API Name}", "1.0.0");
    }

    private MicrocksHolder() {
    }
}
```

The artifact path is a classpath resource (`src/test/resources/third-parties/`). The service
name is the contract's `info.title`, spaces kept as written.

- **Targeted scenario** (`*Test`): hand the use case the real HTTP gateway built on
  `MicrocksHolder.downstreamUrl()`.
- **Walking skeleton / API test** (`*IT` that starts the application): point the application's
  client at it.

Spring Boot:

```java
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
class OrderApiIT {
    @DynamicPropertySource
    static void downstream(DynamicPropertyRegistry registry) {
        registry.add("{downstream}.base-url", MicrocksHolder::downstreamUrl);
    }
}
```

Quarkus: a `QuarkusTestResourceLifecycleManager` whose `start()` returns
`Map.of("quarkus.rest-client.{downstream}.url", MicrocksHolder.downstreamUrl())`, attached with
`@QuarkusTestResource`.

To assert the mock was actually hit, use `MICROCKS.verify("{Downstream API Name}", "1.0.0")` or
`MICROCKS.getServiceInvocationsCount(...)`.

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
- One Microcks container per test JVM, started by the holder class.
- `verify` / `getServiceInvocationsCount` only ASSERT the mock was used; they are not provider
  contract verification.
- Inject the mock URL through configuration properties, never by mutating a bean after startup.
- No Docker or Podman answers: never `@Disabled` or skip the test, never put a fake in its place;
  let the container start fail and stop, blocked, naming the component (the scenario is INDETERMINATE).
