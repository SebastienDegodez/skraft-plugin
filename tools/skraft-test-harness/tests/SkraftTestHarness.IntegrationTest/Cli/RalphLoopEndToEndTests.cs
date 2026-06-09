using SkraftTestHarness.Cli;

namespace SkraftTestHarness.IntegrationTest.Cli;

/// <summary>
/// RED: end-to-end tests driving the <c>skraft-test-harness ralph</c>
/// sub-command through <see cref="Program.Run"/>. These tests fail
/// until GREEN wires <c>RalphCommand</c> to run <c>evaluate</c> N times,
/// consolidate the <c>SkillVerdict</c>s into an <c>AggregateReport</c>
/// and print the <c>ImprovementScore</c>. The stub currently throws
/// <see cref="NotImplementedException"/>.
/// </summary>
public sealed class RalphLoopEndToEndTests
{
    [Test]
    public async Task ShouldRunEvaluateNTimesAndPrintAggregateImprovementScore()
    {
        using var workspace = new TempWorkspace();
        workspace.WriteEvalYaml("""
            scenarios:
              - name: "Echo scenario"
                prompt: "Say hi."
                assertions:
                  - output_contains: "hi"
            """);

        using var writer = new StringWriter();

        var exitCode = await Program.Run(
            ["ralph", "--skill", "test-skill",
             "--tests-dir", workspace.Path,
             "--runs", "2", "--mock"],
            writer);

        var output = writer.ToString();
        await Assert.That(exitCode).IsEqualTo(0);
        await Assert.That(output).Contains("ImprovementScore");
    }

    [Test]
    public async Task ShouldExitNonZeroWhenScoreBelowThreshold()
    {
        using var workspace = new TempWorkspace();
        workspace.WriteEvalYaml("""
            scenarios:
              - name: "Echo scenario"
                prompt: "Say hi."
                assertions:
                  - output_contains: "hi"
            """);

        using var writer = new StringWriter();

        var exitCode = await Program.Run(
            ["ralph", "--skill", "test-skill",
             "--tests-dir", workspace.Path,
             "--runs", "1", "--mock", "--threshold", "2"],  // above max ImprovementScore of 1.0 → always fail
            writer);

        await Assert.That(exitCode).IsNotEqualTo(0);
    }
}
