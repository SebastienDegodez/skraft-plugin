using System.Text.Json;
using SkraftTestHarness.Cli;

namespace SkraftTestHarness.IntegrationTest.Cli;

/// <summary>
/// The <c>evaluate</c> JSON report carries, per scenario, the with-skill
/// run's telemetry (model, output tokens, AIC) so the dashboard's Skill
/// value tab can show real cost. In <c>--mock</c> mode the telemetry is
/// absent, so its fields serialise as null but the keys are present.
/// </summary>
public sealed class EvaluateReportTelemetryEndToEndTests
{
    [Test]
    public async Task EvaluateReport_IncludesPerScenarioTelemetryKeys()
    {
        using var scenarios = new TempWorkspace();
        scenarios.WriteEvalYaml("""
            scenarios:
              - name: "Echo scenario"
                prompt: "Say hi."
                assertions:
                  - output_contains: "hi"
            """);
        using var reportDir = new TempWorkspace();
        using var stdout = new StringWriter();

        var exitCode = await Program.Run(
            ["evaluate", "--skill", "outside-in-tdd", "--tests-dir", scenarios.Path, "--mock", "--report-dir", reportDir.Path],
            stdout);

        await Assert.That(exitCode).IsEqualTo(0);

        var reportFile = Directory.GetFiles(reportDir.Path, "*.json").Single();
        using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(reportFile));
        var scenario = doc.RootElement.GetProperty("scenarios")[0];

        await Assert.That(scenario.TryGetProperty("model", out _)).IsTrue();
        await Assert.That(scenario.TryGetProperty("outputTokens", out _)).IsTrue();
        await Assert.That(scenario.TryGetProperty("premiumRequests", out _)).IsTrue();
    }
}
