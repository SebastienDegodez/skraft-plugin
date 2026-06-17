using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.UnitTest.Domain.Telemetry;

/// <summary>
/// What a single agent run cost and which model answered: the model
/// name, the output tokens it produced, and the AIC (premium requests)
/// it consumed. Each value is optional — a null means the Copilot CLI
/// did not provide it (e.g. input tokens are never emitted).
/// </summary>
public sealed class RunTelemetryTests
{
    [Test]
    public async Task NoneReportsEveryValueAsAbsent()
    {
        var telemetry = RunTelemetry.None();

        string? model = "set";
        long? output = -1;
        long? aic = -1;
        telemetry.WithModel(m => model = m);
        telemetry.WithOutputTokens(t => output = t);
        telemetry.WithPremiumRequests(p => aic = p);

        await Assert.That(model).IsNull();
        await Assert.That(output).IsNull();
        await Assert.That(aic).IsNull();
    }

    [Test]
    public async Task ReportsTheValuesItWasGiven()
    {
        var telemetry = new RunTelemetry("claude-sonnet-4.6", outputTokens: 10, premiumRequests: 1);

        string? model = null;
        long? output = null;
        long? aic = null;
        telemetry.WithModel(m => model = m);
        telemetry.WithOutputTokens(t => output = t);
        telemetry.WithPremiumRequests(p => aic = p);

        await Assert.That(model).IsEqualTo("claude-sonnet-4.6");
        await Assert.That(output).IsEqualTo(10L);
        await Assert.That(aic).IsEqualTo(1L);
    }
}
