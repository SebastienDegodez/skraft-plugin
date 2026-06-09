using SkraftTestHarness.Cli;

namespace SkraftTestHarness.IntegrationTest.Cli;

/// <summary>
/// End-to-end test for the <c>--report-dir</c> CLI option: when set,
/// the <c>evaluate --mock</c> sub-command must drop a JSON
/// <c>SkillVerdict</c> file in the target directory through the real
/// <see cref="SkraftTestHarness.Infrastructure.Reporting.JsonReporter"/>.
/// </summary>
public sealed class EvaluateReportDirEndToEndTests
{
    [Test]
    public async Task EvaluateWithMockAndReportDir_ShouldWriteJsonReportFile()
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
        var reports = Directory.GetFiles(reportDir.Path, "*.json");
        await Assert.That(reports.Length).IsGreaterThanOrEqualTo(1);
        await Assert.That(Path.GetFileName(reports[0])).StartsWith("outside-in-tdd-");
    }
}
