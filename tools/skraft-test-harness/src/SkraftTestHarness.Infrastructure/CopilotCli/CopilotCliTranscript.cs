using System.Text;
using System.Text.Json;
using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Infrastructure.CopilotCli;

/// <summary>
/// Parses the JSONL transcript emitted by <c>copilot --output-format json</c>
/// into an <see cref="AgentRunResult"/>: the assistant text (from
/// <c>assistant.message</c> events) plus the tools the agent actually
/// executed (from <c>tool.execution_start</c> events). Malformed or blank
/// lines are skipped so a partial stream never throws.
/// </summary>
public static class CopilotCliTranscript
{
    private const string AssistantMessageType = "assistant.message";
    private const string ToolExecutionStartType = "tool.execution_start";
    private const string ToolsUpdatedType = "session.tools_updated";
    private const string ResultType = "result";

    public static AgentRunResult Parse(string jsonl)
    {
        var output = new StringBuilder();
        var tools = new List<ToolName>();

        string? model = null;
        long outputTokens = 0;
        bool sawOutputTokens = false;
        long? premiumRequests = null;

        foreach (var line in EnumerateLines(jsonl))
        {
            if (!TryParseEvent(line, out var root))
                continue;

            var type = ReadString(root, "type");
            if (type is null)
                continue;

            // The result event carries `usage` at its root, not under `data`.
            if (type == ResultType)
            {
                if (root.TryGetProperty("usage", out var usage) && usage.ValueKind == JsonValueKind.Object)
                    premiumRequests = ReadLong(usage, "premiumRequests") ?? premiumRequests;
                continue;
            }

            if (!root.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Object)
                continue;

            switch (type)
            {
                case AssistantMessageType:
                    AppendContent(output, data);
                    model ??= ReadString(data, "model");
                    if (ReadLong(data, "outputTokens") is { } tokens)
                    {
                        outputTokens += tokens;
                        sawOutputTokens = true;
                    }
                    break;
                case ToolExecutionStartType:
                    AppendTool(tools, data);
                    break;
                case ToolsUpdatedType:
                    model ??= ReadString(data, "model");
                    break;
            }
        }

        var telemetry = new RunTelemetry(
            model,
            sawOutputTokens ? outputTokens : null,
            premiumRequests);

        return new AgentRunResult(
            new AgentOutput(output.ToString()),
            new ToolInvocations(tools),
            telemetry);
    }

    private static IEnumerable<string> EnumerateLines(string jsonl)
        => jsonl.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    private static bool TryParseEvent(string line, out JsonElement root)
    {
        try
        {
            using var document = JsonDocument.Parse(line);
            root = document.RootElement.Clone();
            return root.ValueKind == JsonValueKind.Object;
        }
        catch (JsonException)
        {
            root = default;
            return false;
        }
    }

    private static void AppendContent(StringBuilder output, JsonElement data)
    {
        var content = ReadString(data, "content");
        if (string.IsNullOrEmpty(content))
            return;

        if (output.Length > 0)
            output.Append('\n');
        output.Append(content);
    }

    private static void AppendTool(List<ToolName> tools, JsonElement data)
    {
        var name = ReadString(data, "toolName");
        if (!string.IsNullOrWhiteSpace(name))
            tools.Add(new ToolName(name));
    }

    private static string? ReadString(JsonElement element, string property)
        => element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static long? ReadLong(JsonElement element, string property)
        => element.TryGetProperty(property, out var value)
            && value.ValueKind == JsonValueKind.Number
            && value.TryGetInt64(out var number)
            ? number
            : null;
}
