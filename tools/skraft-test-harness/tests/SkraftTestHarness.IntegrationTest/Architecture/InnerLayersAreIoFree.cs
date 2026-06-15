using NetArchTest.Rules;
using Assembly = System.Reflection.Assembly;

namespace SkraftTestHarness.IntegrationTest.Architecture;

/// <summary>
/// Keeps the inner layers free of direct I/O. Any file, network or console
/// access belongs in Infrastructure/Cli adapters so Domain and Application
/// stay deterministic and fast to test.
/// </summary>
public sealed class InnerLayersAreIoFree
{
    private const string DomainAssembly = "SkraftTestHarness.Domain";
    private const string ApplicationAssembly = "SkraftTestHarness.Application";

    private static readonly string[] ForbiddenNamespaces =
    [
        "System.IO",
        "System.Net",
        "System.Net.Http",
        "Microsoft.Data.Sqlite",
        "YamlDotNet",
    ];

    [Test]
    public async Task Domain_has_no_IO_dependencies()
        => await AssertNoIoIn(DomainAssembly);

    [Test]
    public async Task Application_has_no_IO_dependencies()
        => await AssertNoIoIn(ApplicationAssembly);

    private static async Task AssertNoIoIn(string assemblyName)
    {
        var result = Types.InAssembly(Assembly.Load(assemblyName))
            .ShouldNot()
            .HaveDependencyOnAny(ForbiddenNamespaces)
            .GetResult();

        var offenders = result.IsSuccessful || result.FailingTypes is null
            ? string.Empty
            : string.Join(", ", result.FailingTypes.Select(t => t.FullName));

        await Assert.That(result.IsSuccessful)
            .IsTrue()
            .Because($"{assemblyName} must not depend on I/O namespaces ({string.Join(", ", ForbiddenNamespaces)}). Violations: {offenders}");
    }
}
