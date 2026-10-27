using System.Reflection;
using System.Xml.Linq;
using Mastermind.Application;
using Mastermind.Domain;
using Mastermind.Infrastructure;
using NetArchTest.Rules;

namespace Mastermind.IntegrationTest;

public sealed class ArchitectureTests
{
    private static readonly Assembly DomainAssembly = typeof(IDomainMarker).Assembly;
    private static readonly Assembly ApplicationAssembly = typeof(IApplicationMarker).Assembly;
    private static readonly Assembly InfrastructureAssembly = typeof(IInfrastructureMarker).Assembly;

    // The reference graph is the rule; transitive types (Domain in Infrastructure, Application in Api) may be imported.
    [Theory]
    [InlineData("Mastermind.Domain")]
    [InlineData("Mastermind.Application", "Mastermind.Domain")]
    [InlineData("Mastermind.Infrastructure", "Mastermind.Application")]
    [InlineData("Mastermind.Api", "Mastermind.Infrastructure")]
    public void Project_ReferencesOnlyItsInnerNeighbour(string project, params string[] allowed)
    {
        var references = XDocument.Load(ProjectFile(project))
            .Descendants("ProjectReference")
            .Select(reference => Path.GetFileNameWithoutExtension(((string)reference.Attribute("Include")!).Replace('\\', '/')))
            .Order()
            .ToArray();

        Assert.Equal(allowed.Order().ToArray(), references);
    }

    [Fact]
    public void Domain_DependsOnlyOnItselfAndTheLanguageCore()
        => AssertOnly(DomainAssembly, "Mastermind.Domain");

    [Fact]
    public void Application_DependsOnlyOnInnerLayersAndTheLanguageCore()
        => AssertOnly(ApplicationAssembly, "Mastermind.Application", "Mastermind.Domain");

    // A feature namespace never uses another feature's; Shared is for what two features need.
    [Fact]
    public void ApplicationFeatures_DoNotDependOnEachOther()
    {
        const string root = "Mastermind.Application.";
        var features = ApplicationAssembly.GetTypes()
            .Select(type => type.Namespace)
            .Where(ns => ns is not null && ns.StartsWith(root, StringComparison.Ordinal))
            .Select(ns => ns![root.Length..].Split('.')[0])
            .Where(feature => feature != "Shared")
            .Distinct()
            .ToArray();
        foreach (var feature in features)
        {
            var others = features.Where(other => other != feature).Select(other => root + other).ToArray();
            if (others.Length == 0) continue;
            var result = Types.InAssembly(ApplicationAssembly)
                .That().ResideInNamespace(root + feature)
                .ShouldNot().HaveDependencyOnAny(others)
                .GetResult();
            Assert.True(result.IsSuccessful, Format(result));
        }
    }

    [Fact]
    public void Infrastructure_ShouldNotDependOn_Api()
    {
        var result = Types.InAssembly(InfrastructureAssembly)
            .Should().NotHaveDependencyOn("Mastermind.Api")
            .GetResult();

        Assert.True(result.IsSuccessful, Format(result));
    }

    [Fact]
    public void Domain_Classes_Should_Be_Sealed()
    {
        var result = Types.InAssembly(DomainAssembly)
            .That().AreClasses().And().AreNotAbstract()
            .Should().BeSealed()
            .GetResult();

        Assert.True(result.IsSuccessful, Format(result));
    }

    private static string ProjectFile(string project)
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !directory.EnumerateFiles("*.sln*").Any())
            directory = directory.Parent;

        return Path.Combine(directory!.FullName, "src", project, $"{project}.csproj");
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
