using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.UnitTest.Domain;

/// <summary>
/// An agent run result also carries the run's telemetry (model, output
/// tokens, AIC). Existing constructors keep working: they default to
/// absent telemetry, so every prior caller is unaffected.
/// </summary>
public sealed class AgentRunResultTelemetryTests
{
    [Test]
    public async Task CarriesTheTelemetryItWasGiven()
    {
        var telemetry = new RunTelemetry("claude-sonnet-5", outputTokens: 10, premiumRequests: 1);
        var result = new AgentRunResult(
            new AgentOutput("out"), ToolInvocations.None(), telemetry);

        string? model = null;
        result.WithTelemetry(t => t.WithModel(m => model = m));

        await Assert.That(model).IsEqualTo("claude-sonnet-5");
    }

    [Test]
    public async Task DefaultsToAbsentTelemetryForTheLegacyConstructor()
    {
        var result = AgentRunResult.OutputOnly(new AgentOutput("out"));

        long? aic = -1;
        result.WithTelemetry(t => t.WithPremiumRequests(p => aic = p));

        await Assert.That(aic).IsNull();
    }
}
