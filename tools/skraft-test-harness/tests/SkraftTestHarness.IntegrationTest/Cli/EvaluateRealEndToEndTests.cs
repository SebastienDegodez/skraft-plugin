using SkraftTestHarness.Cli;

namespace SkraftTestHarness.IntegrationTest.Cli;

/// <summary>
/// End-to-end test of the real (non-mock) <c>evaluate</c> path: drives
/// <see cref="Program.Run"/> against a tiny eval suite, which runs the
/// scenario through the real <c>copilot</c> CLI twice (baseline + with
/// skill) and judges the pair. Opt-in via <c>SKRAFT_COPILOT_LIVE=1</c> so
/// CI never burns model quota.
/// </summary>
public sealed class EvaluateRealEndToEndTests
{
    [Test]
    public async Task EvaluateWithoutMock_ShouldExitZeroAndPrintSkillVerdictLine()
    {
        if (!LiveEnabled())
            return;

        using var workspace = new TempWorkspace();
        workspace.WriteEvalYaml("""
            scenarios:
              - name: "Pong"
                prompt: "Reply with exactly the word: pong. Do not use any tools."
                assertions:
                  - output_contains: "pong"
            """);

        using var stdout = new StringWriter();

        var exitCode = await Program.Run(
            ["evaluate", "--skill", "outside-in-tdd", "--tests-dir", workspace.Path],
            stdout);

        await Assert.That(exitCode).IsEqualTo(0);
        await Assert.That(stdout.ToString()).Contains("SkillVerdict(skill=outside-in-tdd");
    }

    private static bool LiveEnabled()
        => string.Equals(
            Environment.GetEnvironmentVariable("SKRAFT_COPILOT_LIVE"),
            "1",
            StringComparison.Ordinal);
}
