using System.Text.Json;
using SkraftTestHarness.Cli;

namespace SkraftTestHarness.IntegrationTest.Cli;

/// <summary>
/// When <c>run-gate</c> is given <c>--report-dir</c>, it writes a JSON
/// gate report carrying, per scenario, the PASS/FAIL status and the run
/// telemetry (model, output tokens, AIC). In <c>--mock</c> mode the
/// telemetry is absent, so its fields serialise as null.
/// </summary>
public sealed class RunGateReportEndToEndTests
{
    [Test]
    public async Task RunGateWithReportDir_WritesAGateReportWithTelemetryFields()
    {
        using var workspace = new TempWorkspace();
        workspace.WriteFile("eval.skraft.yml", """
            scenarios:
              - name: "Deliver gate"
                prompt: "Run DELIVER."
                assertions:
                  - output_contains: "improved"
            """);
        var reportDir = Path.Combine(workspace.Path, "reports");

        using var stdout = new StringWriter();
        var exitCode = await Program.Run(
            ["run-gate", "--skill", "skraft-orchestrator", "--tests-dir", workspace.Path,
             "--mock", "--report-dir", reportDir],
            stdout);

        await Assert.That(exitCode).IsEqualTo(0);

        var reportFile = Directory.GetFiles(reportDir, "*.json").Single();
        using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(reportFile));
        var root = doc.RootElement;

        await Assert.That(root.GetProperty("tab").GetString()).IsEqualTo("gate");
        var scenario = root.GetProperty("scenarios")[0];
        await Assert.That(scenario.GetProperty("name").GetString()).IsEqualTo("Deliver gate");
        await Assert.That(scenario.GetProperty("status").GetString()).IsEqualTo("PASS");
        // Telemetry keys are present even when the value is null (mock run).
        await Assert.That(scenario.TryGetProperty("model", out _)).IsTrue();
        await Assert.That(scenario.TryGetProperty("outputTokens", out _)).IsTrue();
        await Assert.That(scenario.TryGetProperty("premiumRequests", out _)).IsTrue();
    }
}
