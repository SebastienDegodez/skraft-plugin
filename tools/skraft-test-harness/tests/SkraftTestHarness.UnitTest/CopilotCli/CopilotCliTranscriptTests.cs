using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Infrastructure.CopilotCli;

namespace SkraftTestHarness.UnitTest.CopilotCli;

/// <summary>
/// Unit tests for <see cref="CopilotCliTranscript"/>: the pure parser that
/// turns the Copilot CLI's JSONL stream into an <see cref="AgentRunResult"/>.
/// Fixtures mirror the real schema (assistant.message → data.content,
/// tool.execution_start → data.toolName).
/// </summary>
public sealed class CopilotCliTranscriptTests
{
    [Test]
    public async Task ShouldExtractAssistantMessageContentAsOutput()
    {
        const string jsonl =
            """
            {"type":"assistant.turn_start","data":{"turnId":"0"}}
            {"type":"assistant.message","data":{"content":"hello world","toolRequests":[]}}
            {"type":"result","data":null}
            """;

        var result = CopilotCliTranscript.Parse(jsonl);

        await Assert.That(result.Output().Contains(new Needle("hello world"))).IsTrue();
    }

    [Test]
    public async Task ShouldConcatenateMultipleAssistantMessages()
    {
        const string jsonl =
            """
            {"type":"assistant.message","data":{"content":"first part"}}
            {"type":"assistant.message","data":{"content":"second part"}}
            """;

        var result = CopilotCliTranscript.Parse(jsonl);

        await Assert.That(result.Output().Contains(new Needle("first part"))).IsTrue();
        await Assert.That(result.Output().Contains(new Needle("second part"))).IsTrue();
    }

    [Test]
    public async Task ShouldCaptureToolInvocationsFromExecutionStartEvents()
    {
        const string jsonl =
            """
            {"type":"assistant.message","data":{"content":"running"}}
            {"type":"tool.execution_start","data":{"toolCallId":"x","toolName":"bash"}}
            {"type":"tool.execution_complete","data":{"toolCallId":"x","success":true}}
            """;

        var result = CopilotCliTranscript.Parse(jsonl);

        await Assert.That(result.HasInvoked(new ToolName("bash"))).IsTrue();
    }

    [Test]
    public async Task ShouldNotReportToolsThatWereNeverInvoked()
    {
        const string jsonl =
            """
            {"type":"assistant.message","data":{"content":"no tools here"}}
            """;

        var result = CopilotCliTranscript.Parse(jsonl);

        await Assert.That(result.HasInvoked(new ToolName("bash"))).IsFalse();
    }

    [Test]
    public async Task ShouldIgnoreSessionAndEphemeralEvents()
    {
        const string jsonl =
            """
            {"type":"session.skills_loaded","data":{"skills":[]},"ephemeral":true}
            {"type":"session.tools_updated","data":{"model":"claude"}}
            {"type":"assistant.message","data":{"content":"only this"}}
            """;

        var result = CopilotCliTranscript.Parse(jsonl);

        await Assert.That(result.Output().Contains(new Needle("only this"))).IsTrue();
        await Assert.That(result.HasInvoked(new ToolName("session"))).IsFalse();
    }

    [Test]
    public async Task ShouldSkipBlankAndMalformedLinesWithoutThrowing()
    {
        const string jsonl =
            "\n   \nnot-json-at-all\n{\"type\":\"assistant.message\",\"data\":{\"content\":\"resilient\"}}\n{ broken json";

        var result = CopilotCliTranscript.Parse(jsonl);

        await Assert.That(result.Output().Contains(new Needle("resilient"))).IsTrue();
    }
}
