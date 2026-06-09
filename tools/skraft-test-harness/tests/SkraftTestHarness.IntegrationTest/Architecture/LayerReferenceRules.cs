using NetArchTest.Rules;
using Assembly = System.Reflection.Assembly;

namespace SkraftTestHarness.IntegrationTest.Architecture;

/// <summary>
/// Clean Architecture layer-reference rules. These are a CI gate (NOT a tight-loop test),
/// hence hosted in IntegrationTest per the clean-architecture-testing skill.
/// </summary>
public sealed class LayerReferenceRules
{
    private const string DomainAssembly = "SkraftTestHarness.Domain";
    private const string ApplicationAssembly = "SkraftTestHarness.Application";
    private const string InfrastructureAssembly = "SkraftTestHarness.Infrastructure";
    private const string DashboardAssembly = "SkraftTestHarness.Dashboard";
    private const string CliAssembly = "SkraftTestHarness.Cli";

    private static Assembly Load(string name) => Assembly.Load(name);

    [Test]
    public async Task Domain_does_not_reference_any_other_layer()
    {
        var result = Types.InAssembly(Load(DomainAssembly))
            .ShouldNot()
            .HaveDependencyOnAny(ApplicationAssembly, InfrastructureAssembly, DashboardAssembly, CliAssembly)
            .GetResult();

        await Assert.That(result.IsSuccessful)
            .IsTrue()
            .Because(Describe("Domain must not reference Application/Infrastructure/Dashboard/Cli", result));
    }

    [Test]
    public async Task Application_does_not_reference_Infrastructure_Dashboard_or_Cli()
    {
        var result = Types.InAssembly(Load(ApplicationAssembly))
            .ShouldNot()
            .HaveDependencyOnAny(InfrastructureAssembly, DashboardAssembly, CliAssembly)
            .GetResult();

        await Assert.That(result.IsSuccessful)
            .IsTrue()
            .Because(Describe("Application must not reference Infrastructure/Dashboard/Cli", result));
    }

    [Test]
    public async Task Infrastructure_does_not_reference_Cli_or_Dashboard()
    {
        var result = Types.InAssembly(Load(InfrastructureAssembly))
            .ShouldNot()
            .HaveDependencyOnAny(CliAssembly, DashboardAssembly)
            .GetResult();

        await Assert.That(result.IsSuccessful)
            .IsTrue()
            .Because(Describe("Infrastructure must not reference Cli/Dashboard", result));
    }

    [Test]
    public async Task Dashboard_does_not_reference_Infrastructure_or_Cli()
    {
        var result = Types.InAssembly(Load(DashboardAssembly))
            .ShouldNot()
            .HaveDependencyOnAny(InfrastructureAssembly, CliAssembly)
            .GetResult();

        await Assert.That(result.IsSuccessful)
            .IsTrue()
            .Because(Describe("Dashboard generator must not depend on Infrastructure/Cli", result));
    }

    private static string Describe(string rule, NetArchTest.Rules.TestResult result)
    {
        if (result.IsSuccessful) return rule;
        var offenders = result.FailingTypes is null
            ? "(no detail)"
            : string.Join(", ", result.FailingTypes.Select(t => t.FullName));
        return $"{rule}. Violations: {offenders}";
    }
}
