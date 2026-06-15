using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Infrastructure.CopilotCli;

namespace SkraftTestHarness.UnitTest.CopilotCli;

/// <summary>
/// The transcript parser also captures the run telemetry the Copilot
/// CLI emits: the model that answered, the output tokens summed across
/// assistant messages, and the AIC (premium requests) from the final
/// result event. Fixtures mirror the real CLI 1.0.62 schema, where the
/// result event carries `usage` at its root (not under `data`).
/// </summary>
public sealed class CopilotCliTranscriptTelemetryTests
{
    [Test]
    public async Task CapturesModelOutputTokensAndPremiumRequests()
    {
        const string jsonl =
            """
            {"type":"session.tools_updated","data":{"model":"claude-sonnet-4.6"}}
            {"type":"assistant.message","data":{"content":"OK","model":"claude-sonnet-4.6","outputTokens":4}}
            {"type":"assistant.message","data":{"content":"more","model":"claude-sonnet-4.6","outputTokens":6}}
            {"type":"result","timestamp":"2026-06-15T20:43:04.882Z","exitCode":0,"usage":{"premiumRequests":1,"totalApiDurationMs":1910}}
            """;

        var result = CopilotCliTranscript.Parse(jsonl);

        string? model = null;
        long? output = null;
        long? aic = null;
        result.WithTelemetry(t =>
        {
            t.WithModel(m => model = m);
            t.WithOutputTokens(o => output = o);
            t.WithPremiumRequests(p => aic = p);
        });

        await Assert.That(model).IsEqualTo("claude-sonnet-4.6");
        await Assert.That(output).IsEqualTo(10L);
        await Assert.That(aic).IsEqualTo(1L);
    }

    [Test]
    public async Task DegradesToAbsentTelemetryWhenTheStreamHasNoUsage()
    {
        const string jsonl =
            """
            {"type":"assistant.message","data":{"content":"hello"}}
            {"type":"result","data":null}
            """;

        var result = CopilotCliTranscript.Parse(jsonl);

        string? model = "set";
        long? output = -1;
        long? aic = -1;
        result.WithTelemetry(t =>
        {
            t.WithModel(m => model = m);
            t.WithOutputTokens(o => output = o);
            t.WithPremiumRequests(p => aic = p);
        });

        await Assert.That(model).IsNull();
        await Assert.That(output).IsNull();
        await Assert.That(aic).IsNull();
    }
}
