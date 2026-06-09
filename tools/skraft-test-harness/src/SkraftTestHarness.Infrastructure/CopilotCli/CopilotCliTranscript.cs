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

    public static AgentRunResult Parse(string jsonl)
    {
        var output = new StringBuilder();
        var tools = new List<ToolName>();

        foreach (var line in EnumerateLines(jsonl))
        {
            if (!TryParseEvent(line, out var root))
                continue;

            var type = ReadString(root, "type");
            if (type is null || !root.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Object)
                continue;

            switch (type)
            {
                case AssistantMessageType:
                    AppendContent(output, data);
                    break;
                case ToolExecutionStartType:
                    AppendTool(tools, data);
                    break;
            }
        }

        return new AgentRunResult(new AgentOutput(output.ToString()), new ToolInvocations(tools));
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
}
