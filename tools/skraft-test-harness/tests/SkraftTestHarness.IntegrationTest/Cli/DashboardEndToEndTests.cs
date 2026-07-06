using System.Text.Json;
using SkraftTestHarness.Cli;

namespace SkraftTestHarness.IntegrationTest.Cli;

/// <summary>
/// The <c>dashboard</c> sub-command reads every harness report under a
/// directory (both <c>evaluate</c> and <c>gate</c> reports), and folds
/// them into a single <c>dashboard-data.json</c> with two sections —
/// <c>gates</c> (PASS/FAIL) and <c>skillValue</c> (winner) — plus the
/// distinct models tested and a generation timestamp. Each row carries
/// the run telemetry so the dashboard can show real cost.
/// </summary>
public sealed class DashboardEndToEndTests
{
    [Test]
    public async Task Dashboard_FoldsEvaluateAndGateReportsIntoDashboardData()
    {
        using var reports = new TempWorkspace();
        reports.WriteFile("outside-in-tdd-2026.json", """
            {
              "skill": "outside-in-tdd",
              "scenarios": [
                { "name": "Echo", "winner": "WithSkill", "reason": "Assertion pass count comparison",
                  "model": "claude-sonnet-5", "outputTokens": 12, "premiumRequests": 2 }
              ]
            }
            """);
        reports.WriteFile("skraft-orchestrator-2026.json", """
            {
              "tab": "gate",
              "skill": "skraft-orchestrator",
              "scenarios": [
                { "name": "Deliver gate", "status": "PASS",
                  "model": "claude-sonnet-5", "outputTokens": 30, "premiumRequests": 3 }
              ]
            }
            """);

        var outFile = Path.Combine(reports.Path, "dashboard-data.json");
        using var stdout = new StringWriter();

        var exitCode = await Program.Run(
            ["dashboard", "--reports-dir", reports.Path, "--out", outFile],
            stdout);

        await Assert.That(exitCode).IsEqualTo(0);
        await Assert.That(File.Exists(outFile)).IsTrue();

        using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(outFile));
        var root = doc.RootElement;

        await Assert.That(root.TryGetProperty("generatedAt", out _)).IsTrue();

        var gates = root.GetProperty("gates");
        await Assert.That(gates.GetArrayLength()).IsEqualTo(1);
        await Assert.That(gates[0].GetProperty("status").GetString()).IsEqualTo("PASS");
        await Assert.That(gates[0].GetProperty("premiumRequests").GetInt64()).IsEqualTo(3L);

        var skillValue = root.GetProperty("skillValue");
        await Assert.That(skillValue.GetArrayLength()).IsEqualTo(1);
        await Assert.That(skillValue[0].GetProperty("winner").GetString()).IsEqualTo("WithSkill");

        var models = root.GetProperty("models");
        await Assert.That(models.GetArrayLength()).IsEqualTo(1);
        await Assert.That(models[0].GetString()).IsEqualTo("claude-sonnet-5");
    }
}
