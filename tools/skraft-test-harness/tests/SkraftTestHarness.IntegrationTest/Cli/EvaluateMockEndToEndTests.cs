using SkraftTestHarness.Cli;

namespace SkraftTestHarness.IntegrationTest.Cli;

/// <summary>
/// End-to-end walking skeleton: drives the <c>skraft-test-harness
/// evaluate --mock</c> sub-command through <see cref="Program.Run"/>,
/// captures stdout and asserts the verdict line is produced with
/// exit code 0. Proves the full composition (CLI → Application →
/// Domain ← Infrastructure mock adapters) is wired correctly, with
/// scenarios loaded from a real <c>eval.yaml</c> on disk.
/// </summary>
public sealed class EvaluateMockEndToEndTests
{
    [Test]
    public async Task EvaluateWithMock_ShouldExitZeroAndPrintSkillVerdictLine()
    {
        using var workspace = new TempWorkspace();
        workspace.WriteEvalYaml("""
            scenarios:
              - name: "Echo scenario"
                prompt: "Say hi."
                assertions:
                  - output_contains: "hi"
            """);

        using var stdout = new StringWriter();

        var exitCode = await Program.Run(
            ["evaluate", "--skill", "outside-in-tdd", "--tests-dir", workspace.Path, "--mock"],
            stdout);

        await Assert.That(exitCode).IsEqualTo(0);
        var output = stdout.ToString();
        await Assert.That(output).Contains("SkillVerdict(skill=outside-in-tdd");
        await Assert.That(output).Contains("winner: with-skill");
    }

    [Test]
    public async Task EvaluateWithoutMock_WhenCopilotExecutableMissing_ShouldExitNonZeroWithError()
    {
        using var workspace = new TempWorkspace();
        workspace.WriteEvalYaml("""
            scenarios:
              - name: "Echo scenario"
                prompt: "Say hi."
                assertions:
                  - output_contains: "hi"
            """);

        using var stdout = new StringWriter();

        var exitCode = await Program.Run(
            [
                "evaluate", "--skill", "outside-in-tdd", "--tests-dir", workspace.Path,
                "--copilot-exe", "/nonexistent/skraft-no-copilot",
            ],
            stdout);

        await Assert.That(exitCode).IsNotEqualTo(0);
        await Assert.That(stdout.ToString()).Contains("evaluation failed");
    }
}
