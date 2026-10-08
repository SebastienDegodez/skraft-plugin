# Architecture Rules

Layer discipline enforced by CI. Every rule is one test. Failure message must list violating types. The rules are language-agnostic; the implementation below is .NET (NetArchTest), the Java one is in [examples-java.md](examples-java.md), the Python one (import-linter) in [examples-python.md](examples-python.md).

## Project References — the dependency rule

Each project references exactly its inner neighbour. The reference graph is the rule; enforce it on the project files, never on imports.

| Project | References | Never references |
|---|---|---|
| Api | Infrastructure | Application, Domain |
| Infrastructure | Application | Domain, Api |
| Application | Domain | Infrastructure, Api |
| Domain | Nothing | Application, Infrastructure, Api |

Types reachable through a transitive reference MAY be imported: Infrastructure uses the Domain types an Application interface exposes, Api composes Application use cases through its Infrastructure reference. Never add a direct reference to reach them.

## Type Dependency Rules

Correct references still let the business code import a framework, an I/O type or a network client. Guard Domain and Application with an **allow-list**: a deny-list only catches the frameworks someone thought to name, and a guard limited to the project's own layers catches none.

| Layer | May depend on | Everything else fails the build, including |
|---|---|---|
| Domain | Domain, the language core | frameworks, I/O, network, persistence, every other layer |
| Application | Application, Domain, the language core | frameworks, I/O, network, persistence, Infrastructure, Api |

The language core excludes I/O, network and persistence (.NET: `System` minus `System.IO`, `System.Net`, `System.Data`; Java: `java.lang`, `java.util`, `java.time`, `java.math`; Python: the standard library minus I/O, network and database modules).

| Source layer | Forbidden target | Reason |
|---|---|---|
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

    // ----- Domain and Application: allow-list -----

    [Fact] public void Domain_DependsOnlyOnItselfAndTheLanguageCore()
        => AssertOnly(DomainAssembly, "MyApp.Domain");

    [Fact] public void Application_DependsOnlyOnInnerLayersAndTheLanguageCore()
        => AssertOnly(ApplicationAssembly, "MyApp.Application", "MyApp.Domain");

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

    // `System` is the base library; I/O, network and persistence inside it are technical details too.
    private static void AssertOnly(Assembly assembly, params string[] layers)
    {
        var frameworks = Types.InAssembly(assembly)
            .Should().OnlyHaveDependenciesOn([.. layers, "System"])
            .GetResult();
        var io = Types.InAssembly(assembly)
            .Should().NotHaveDependencyOnAny("System.IO", "System.Net", "System.Data")
            .GetResult();

        Assert.True(frameworks.IsSuccessful, Format(frameworks));
        Assert.True(io.IsSuccessful, Format(io));
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
