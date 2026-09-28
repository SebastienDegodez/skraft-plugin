# Architecture Rules (NetArchTest)

Layer discipline enforced by CI. Every rule is one test. Failure message must list violating types.

## Project References — the dependency rule

Each project references exactly its inner neighbour. The reference graph is the rule; enforce it on the project files, never on imports.

| Project | References | Never references |
|---|---|---|
| Api | Infrastructure | Application, Domain |
| Infrastructure | Application | Domain, Api |
| Application | Domain | Infrastructure, Api |
| Domain | Nothing | Application, Infrastructure, Api |

Types reachable through a transitive reference MAY be imported: Infrastructure uses the Domain types an Application port exposes, Api composes Application use cases through its Infrastructure reference. Never add a direct reference to reach them.

## Type Dependency Rules

What imports can still break once references are correct: outward dependencies and framework leaks into the business code.

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
| Infrastructure | Api | Infrastructure implements Application interfaces, never transport |
| SharedKernel | Anything | SharedKernel depends on nothing |

## Implementation Pattern

```csharp
public sealed class ArchitectureTests
{
    // ----- Project references -----

    [Theory]
    [InlineData("MyApp.Domain")]
    [InlineData("MyApp.Application", "MyApp.Domain")]
    [InlineData("MyApp.Infrastructure", "MyApp.Application")]
    [InlineData("MyApp.Api", "MyApp.Infrastructure")]
    public void Project_ReferencesOnlyItsInnerNeighbour(string project, params string[] allowed)
    {
        var references = XDocument.Load(ProjectFile(project))
            .Descendants("ProjectReference")
            .Select(reference => Path.GetFileNameWithoutExtension(((string)reference.Attribute("Include")!).Replace('\\', '/')))
            .Order()
            .ToArray();

        Assert.Equal(allowed.Order().ToArray(), references);
    }

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

    // ----- Infrastructure -----

    [Fact] public void Infrastructure_ShouldNotDependOn_Api()
        => AssertNoDependency(InfrastructureAssembly, "MyApp.Api");

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
    private static readonly Assembly SharedKernelAssembly = typeof(ISharedKernelMarker).Assembly;

    private static string ProjectFile(string project)
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !directory.EnumerateFiles("*.sln*").Any())
            directory = directory.Parent;

        return Path.Combine(directory!.FullName, "src", project, $"{project}.csproj");
    }

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

Architecture tests live in the `IntegrationTest` project and run as a CI gate, never in the suite developers run on every save. They MUST fail the build on violation — never `Skip = "known issue"`.
