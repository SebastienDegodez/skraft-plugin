using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Infrastructure.CopilotCli;

namespace SkraftTestHarness.IntegrationTest.CopilotCli;

/// <summary>
/// Live integration tests for <see cref="CopilotCliAgentRunner"/> driving
/// the real <c>copilot</c> executable through <see cref="ProcessCopilotCliInvoker"/>.
/// They are opt-in: skipped unless <c>SKRAFT_COPILOT_LIVE=1</c> is set (so
/// CI never burns model quota). Verification goes through the public
/// scenario-assertion path — exactly how the harness evaluates a run.
/// </summary>
public sealed class CopilotCliAgentRunnerLiveTests
{
    [Test]
    public async Task ShouldSatisfyAnOutputAssertionForASimplePrompt()
    {
        if (!LiveEnabled())
            return;

        var runner = new CopilotCliAgentRunner(new ProcessCopilotCliInvoker(), new CopilotCliOptions());
        var scenario = Scenario.Create(
            "hello",
            "Reply with exactly the word: pong. Do not use any tools.",
            [new OutputContains(new Needle("pong"))]);

        var result = await runner.RunAsync(scenario, RunMode.Baseline, CancellationToken.None);

        await Assert.That(scenario.EvaluateAgainst(result).AreAllAssertionsPassing()).IsTrue();
    }

    [Test]
    public async Task ShouldSatisfyAToolAssertionWhenTheAgentRunsAShellCommand()
    {
        if (!LiveEnabled())
            return;

        var runner = new CopilotCliAgentRunner(new ProcessCopilotCliInvoker(), new CopilotCliOptions());
        var scenario = Scenario.Create(
            "tooluse",
            "Run the shell command: echo skraft-live. Then reply: done.",
            [new ExpectTools(new ToolName("bash"))]);

        var result = await runner.RunAsync(scenario, RunMode.Baseline, CancellationToken.None);

        await Assert.That(scenario.EvaluateAgainst(result).AreAllAssertionsPassing()).IsTrue();
    }

    private static bool LiveEnabled()
        => string.Equals(
            Environment.GetEnvironmentVariable("SKRAFT_COPILOT_LIVE"),
            "1",
            StringComparison.Ordinal);
}
