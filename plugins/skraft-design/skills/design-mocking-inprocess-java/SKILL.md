---
name: design-mocking-inprocess-java
description: 'Use when a Java component''s brief line says `mocking: inprocess` (the component sets `"mocking": { "strategy": "inprocess" }` in skraft-design-config.json) and an integration test must replace a downstream dependency with an in-process double (WireMock answering at the HTTP layer, or a hand-written fake passed to the application wiring).'
---

# Mocking — In-process x Java

Replaces a downstream dependency the SUT calls with an in-process double in an `*IT` integration
test. Applies only to a Java component whose brief line says `mocking: inprocess`. Pick the
library from the table below: the first row that matches the SUT and is already a test
dependency; otherwise the first row that matches the SUT. Write mock wiring and the
integration-test scaffold only.

## Libraries (table order = priority, top = highest)

| Priority | Library | Fits | Double |
|---|---|---|---|
| 1 | WireMock (`org.wiremock:wiremock-standalone`, 3.x) | the SUT calls the downstream over HTTP, whatever the client | a JVM HTTP server stubbing routes on a free port |
| 2 | fake | any client behind an application port (interface) | a hand-written class passed to the application wiring |

## Recipe — WireMock

```java
// src/test/java/{package}/{Feature}ApiIT.java
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
class ClaimApiIT {
    @RegisterExtension
    static WireMockExtension downstream = WireMockExtension.newInstance()
            .options(wireMockConfig().dynamicPort())
            .build();

    @DynamicPropertySource
    static void downstreamUrl(DynamicPropertyRegistry registry) {
        registry.add("{downstream}.base-url", downstream::baseUrl);
    }

    @Test
    void a_claim_above_the_limit_waits_for_approval() {
        downstream.stubFor(get("/rates/USD").willReturn(okJson("{\"rate\": 1.08}")));

        // call the application API and assert the status

        downstream.verify(getRequestedFor(urlEqualTo("/rates/USD")));
    }
}
```

Quarkus: pass the same URL through a `QuarkusTestResourceLifecycleManager` returning
`Map.of("quarkus.rest-client.{downstream}.url", server.baseUrl())`.
A `fake` replaces the client object itself: the test builds the application wiring with
`new FixedRates("1.08")` where it would build the HTTP gateway.

Files: `src/test/java/{package}/{Feature}ApiIT.java`.

## Rules

- Double the DOWNSTREAM client, never the SUT's own domain or use cases.
- This is an INTEGRATION-test double at the HTTP boundary; Mockito stays out of the core and the
  `*Test` unit tests (G7).
- Inject the double's URL through configuration properties; never reflect into a bean.
