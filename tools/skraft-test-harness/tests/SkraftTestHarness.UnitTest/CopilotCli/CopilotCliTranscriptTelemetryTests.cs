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
            {"type":"session.tools_updated","data":{"model":"claude-sonnet-5"}}
            {"type":"assistant.message","data":{"content":"OK","model":"claude-sonnet-5","outputTokens":4}}
            {"type":"assistant.message","data":{"content":"more","model":"claude-sonnet-5","outputTokens":6}}
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

        await Assert.That(model).IsEqualTo("claude-sonnet-5");
        await Assert.That(output).IsEqualTo(10L);
        await Assert.That(aic).IsEqualTo(1L);
    }

    [Test]
    public async Task CountsSubagentsAndSkillsInvoked()
    {
        const string jsonl =
            """
            {"type":"session.skills_loaded","data":{"skills":[{"name":"a"},{"name":"b"}]}}
            {"type":"session.custom_agents_updated","data":{"agents":[{"name":"skraft:x"},{"name":"skraft:y"}]}}
            {"type":"tool.execution_start","data":{"toolName":"skill","arguments":{"skill":"using-superpowers"}}}
            {"type":"tool.execution_start","data":{"toolName":"skill","arguments":{"skill":"using-superpowers"}}}
            {"type":"subagent.started","data":{"agentName":"skraft:backlog-discoverer"}}
            {"type":"subagent.started","data":{"agentName":"skraft:backlog-discoverer-reviewer"}}
            {"type":"subagent.started","data":{"agentName":"explore"}}
            {"type":"assistant.message","data":{"content":"done","outputTokens":3}}
            {"type":"result","exitCode":0,"usage":{"premiumRequests":1}}
            """;

        var result = CopilotCliTranscript.Parse(jsonl);

        long? agents = null;
        long? skills = null;
        result.WithTelemetry(t =>
        {
            t.WithAgentsInvoked(a => agents = a);
            t.WithSkillsInvoked(s => skills = s);
        });

        // Three subagents actually dispatched (skills_loaded / custom_agents_updated
        // are catalogues of what is AVAILABLE, not invoked, and are ignored).
        await Assert.That(agents).IsEqualTo(3L);
        await Assert.That(skills).IsEqualTo(2L);
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
