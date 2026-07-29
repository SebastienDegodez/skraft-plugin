# Architecture Rules (NetArchTest)

Layer discipline enforced by CI. Every rule is one `[Fact]`. Failure message must list violating types.

## Layer Dependency Rules

| Source layer | Forbidden target | Reason |
|---|---|---|
| Domain | Application | Inversion: Domain must not know about orchestration |
| Domain | Infrastructure | Iron Law: Infrastructure flows inward only via interfaces |
| Domain | Api | Domain is framework-agnostic |
| Domain | `Microsoft.EntityFrameworkCore` | Persistence is Infrastructure only |
| Domain | `Microsoft.AspNetCore.*` | HTTP is API only |
| Application | Infrastructure | Application depends on Domain + abstractions |
| Application | Api | Application is transport-agnostic |
| Application | `Microsoft.EntityFrameworkCore` | EF Core belongs to Infrastructure |
| Application | `Microsoft.AspNetCore.*` | HTTP is API only |
| Api | Application (except `Program.cs`) | API routes through Infrastructure DI / buses |
| SharedKernel | Anything | SharedKernel depends on nothing |

## Implementation Pattern

```csharp
public sealed class ArchitectureTests
{
    // ----- Domain -----

    [Fact] public void Domain_ShouldNotDependOn_Application()
        => AssertNoDependency(DomainAssembly, "MyApp.Application");

    [Fact] public void Domain_ShouldNotDependOn_Infrastructure()
        => AssertNoDependency(DomainAssembly, "MyApp.Infrastructure");

    [Fact] public void Domain_ShouldNotDependOn_Api()
        => AssertNoDependency(DomainAssembly, "MyApp.Api");

    [Fact] public void Domain_ShouldNotDependOn_EntityFrameworkCore()
        => AssertNoDependency(DomainAssembly, "Microsoft.EntityFrameworkCore");

    [Fact] public void Domain_ShouldNotDependOn_AspNetCore()
        => AssertNoDependency(DomainAssembly, "Microsoft.AspNetCore");

    // ----- Application -----

    [Fact] public void Application_ShouldNotDependOn_Infrastructure()
        => AssertNoDependency(ApplicationAssembly, "MyApp.Infrastructure");

    [Fact] public void Application_ShouldNotDependOn_Api()
        => AssertNoDependency(ApplicationAssembly, "MyApp.Api");

    [Fact] public void Application_ShouldNotDependOn_EntityFrameworkCore()
        => AssertNoDependency(ApplicationAssembly, "Microsoft.EntityFrameworkCore");

    [Fact] public void Application_ShouldNotDependOn_AspNetCore()
        => AssertNoDependency(ApplicationAssembly, "Microsoft.AspNetCore");

    // ----- API -----

    [Fact]
    public void Api_ShouldNotDependOn_Application_Except_Program()
    {
        var result = Types.InAssembly(ApiAssembly)
            .That().DoNotHaveName("Program")
            .And().DoNotResideInNamespace("MyApp.Api.Composition")
            .Should().NotHaveDependencyOn("MyApp.Application")
            .GetResult();

        Assert.True(result.IsSuccessful, Format(result));
    }

    // ----- SharedKernel -----

    [Fact] public void SharedKernel_ShouldNotDependOnAnyApp()
    {
        var result = Types.InAssembly(SharedKernelAssembly)
            .Should().NotHaveDependencyOnAny(
                "MyApp.Domain", "MyApp.Application", "MyApp.Infrastructure", "MyApp.Api")
            .GetResult();

        Assert.True(result.IsSuccessful, Format(result));
    }

    // ----- Helpers -----

    private static readonly Assembly DomainAssembly = typeof(IDomainMarker).Assembly;
    private static readonly Assembly ApplicationAssembly = typeof(IApplicationMarker).Assembly;
    private static readonly Assembly InfrastructureAssembly = typeof(IInfrastructureMarker).Assembly;
    private static readonly Assembly ApiAssembly = typeof(IApiMarker).Assembly;
    private static readonly Assembly SharedKernelAssembly = typeof(ISharedKernelMarker).Assembly;

    private static void AssertNoDependency(Assembly assembly, string forbidden)
    {
        var result = Types.InAssembly(assembly)
            .Should().NotHaveDependencyOn(forbidden)
            .GetResult();
        Assert.True(result.IsSuccessful, Format(result));
    }

    private static string Format(TestResult result)
        => $"Violations: {string.Join(", ", result.FailingTypeNames ?? Array.Empty<string>())}";
}
```

## Structural Rules (optional but recommended)

| Rule | Why |
|---|---|
| All `*Handler` in Application implement `ICommandHandler<>` or `IQueryHandler<,>` | Enforces CQS |
| All aggregate roots in Domain are `sealed` and derive from `AggregateRoot` | Prevents inheritance surprises |
| All value objects derive from `ValueObject` | Identity-by-value consistency |
| No public constructor on classes ending with "Aggregate" (factory method required) | Enforces invariants through factories |
| No `IDisposable` on Domain types | Domain must not own I/O |

```csharp
[Fact]
public void AllAggregates_ShouldBeSealed()
{
    var result = Types.InAssembly(DomainAssembly)
        .That().Inherit(typeof(AggregateRoot))
        .Should().BeSealed()
        .GetResult();

    Assert.True(result.IsSuccessful, Format(result));
}

[Fact]
public void AllCommandHandlers_ShouldImplementICommandHandler()
{
    var result = Types.InAssembly(ApplicationAssembly)
        .That().HaveNameEndingWith("CommandHandler")
        .Should().ImplementInterface(typeof(ICommandHandler<>))
        .GetResult();

    Assert.True(result.IsSuccessful, Format(result));
}
```

## CI Integration

Architecture tests run with the unit test suite (fast, <1 s each). They MUST fail the build on violation — never `Skip = "known issue"`.
