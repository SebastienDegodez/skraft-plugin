---
name: mocking-inprocess-dotnet
description: Use when the mocking-strategy-roster resolved (inprocess, .NET) — the override mocking strategy that replaces a downstream dependency with an in-process test double (FakeItEasy, NSubstitute, or Moq) instead of a Microcks container. Provides the concrete double registration swapped into the WebApplicationFactory DI. Emits mock wiring only; the business TDD cycle stays with the software-engineer lead.
---

# Mocking — In-process x .NET adapter (override)

Concrete recipe that mocks a downstream dependency the SUT calls, using an
in-process test double registered in the `WebApplicationFactory` DI, instead of
a Microcks container. Selected when the operator overrides the Microcks default.

Loaded ONLY when `mocking-strategy-roster` resolved `(inprocess, .NET)`. The
roster also passes the chosen library: `fakeiteasy | nsubstitute | moq`. When no
specific library is named, the **Library table below is ordered by priority**
(top = highest): pick the first row whose package is already present in the test
project; if none is present, take the top row.

**Boundary:** mock wiring + integration-test scaffold only. No business TDD, no
Object Calisthenics enforcement, no provider contract verification. The
`software-engineer` lead integrates this into its own TDD loop.

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

## Structured result back to the lead

Return, do not commit:

```yaml
strategy: inprocess
stack: dotnet
library: fakeiteasy | nsubstitute | moq
files:
  - test/{Sut}.IntegrationTests/{Sut}ApiFactory.cs
testCommand: <resolved via resolving-stack-commands>
notes: in-process double for I{Downstream}Client swapped into the test host DI
```

## Rules

- Double the DOWNSTREAM client interface, never the SUT's own domain.
- This is an INTEGRATION-test double at the HTTP boundary — not a Domain/Application
  unit mock (those remain forbidden in the core per craft-discipline).
- Use `resolving-stack-commands` for the test command — never hardcode `dotnet test`.
