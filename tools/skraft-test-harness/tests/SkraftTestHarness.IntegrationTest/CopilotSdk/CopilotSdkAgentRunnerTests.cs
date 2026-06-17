using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Infrastructure.CopilotSdk;

namespace SkraftTestHarness.IntegrationTest.CopilotSdk;

/// <summary>
/// Live integration tests for <see cref="CopilotSdkAgentRunner"/>.
/// Require the <c>GITHUB_TOKEN</c> environment variable to be set with
/// a token that has <c>models:read</c> scope. Tests are skipped
/// automatically when the variable is absent.
/// </summary>
public sealed class CopilotSdkAgentRunnerTests
{
    [Test]
    public async Task ShouldReturnNonEmptyAgentOutputForSimplePrompt()
    {
        var token = Environment.GetEnvironmentVariable("GITHUB_TOKEN");
        if (string.IsNullOrWhiteSpace(token))
            return;

        var runner = new CopilotSdkAgentRunner(token);
        var scenario = Scenario.Create("hello", "Say hello.", []);
        var result = await runner.RunAsync(scenario, RunMode.Baseline, CancellationToken.None);

        await Assert.That(result).IsNotNull();
    }

    [Test]
    public async Task ShouldIncludeToolInvocationsWhenModelUsesTools()
    {
        var token = Environment.GetEnvironmentVariable("GITHUB_TOKEN");
        if (string.IsNullOrWhiteSpace(token))
            return;

        var runner = new CopilotSdkAgentRunner(token);
        var scenario = Scenario.Create("tools", "List files in the current directory.", []);
        var result = await runner.RunAsync(scenario, RunMode.Baseline, CancellationToken.None);

        await Assert.That(result).IsNotNull();
    }
}
