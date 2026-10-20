---
name: mocking-inprocess-dotnet
description: Use when a .NET component's brief line says `mocking: inprocess` (the component sets `"mocking": { "strategy": "inprocess" }` in skraft-config.json) and an integration test must replace a downstream dependency with an in-process test double (FakeItEasy, NSubstitute, or Moq) registered in the WebApplicationFactory DI.
---

# Mocking — In-process x .NET

Replaces a downstream dependency the SUT calls with an in-process test double registered in
the `WebApplicationFactory` DI. Applies only to a .NET component whose brief line says
`mocking: inprocess`. Pick the library from the table below: the first row whose package the
test project already references; none referenced → the top row. Write mock wiring and the
integration-test scaffold only.

## Library packages (table order = priority, top = highest)

| Priority | Library | NuGet | Double creation |
|---|---|---|---|
| 1 | fakeiteasy | `FakeItEasy` | `A.Fake<I{Downstream}Client>()` |
| 2 | nsubstitute | `NSubstitute` | `Substitute.For<I{Downstream}Client>()` |
| 3 | moq | `Moq` | `new Mock<I{Downstream}Client>()` (use `.Object` for the instance) |

## Recipe — register an in-process double in the test host

```csharp
public class {Sut}ApiFactory : WebApplicationFactory<Program>
{
    public I{Downstream}Client DownstreamDouble { get; } =
        // Create via the resolved library's "Double creation" column above.
        CreateDouble();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            // Replace the real downstream client registration with the double.
            services.RemoveAll<I{Downstream}Client>();
            services.AddSingleton(DownstreamDouble);
        });
    }
}
```

The test arranges behaviour on `DownstreamDouble` using the resolved library's
API (`Mock.Setup` / `A.CallTo` / `client.Method(...).Returns(...)`).

Files: `test/{Sut}.IntegrationTests/{Sut}ApiFactory.cs`.

## Rules

- Double the DOWNSTREAM client interface, never the SUT's own domain.
- This is an INTEGRATION-test double at the HTTP boundary — not a Domain/Application
  unit mock (those remain forbidden in the core per craft-discipline).
