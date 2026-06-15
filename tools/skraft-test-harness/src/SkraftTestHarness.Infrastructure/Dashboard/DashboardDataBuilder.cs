using System.Text.Json;

namespace SkraftTestHarness.Infrastructure.Dashboard;

/// <summary>
/// Folds every harness report under a directory into a single
/// dashboard-data document. Reports come in two shapes — <c>evaluate</c>
/// (a per-scenario <c>winner</c>) and <c>gate</c> (a per-scenario
/// <c>status</c>, marked with <c>"tab":"gate"</c>) — and each scenario
/// carries the run telemetry (model, output tokens, AIC). The result has
/// two sections (gates, skillValue), the distinct models tested, and a
/// generation timestamp. Input tokens are never present — the Copilot
/// CLI does not emit them.
/// </summary>
public sealed class DashboardDataBuilder
{
    private static readonly JsonSerializerOptions WriteOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.Never,
    };

    private readonly TimeProvider _clock;

    public DashboardDataBuilder(TimeProvider clock)
        => _clock = clock ?? throw new ArgumentNullException(nameof(clock));

    public async Task BuildAsync(string reportsDir, string outFile, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reportsDir);
        ArgumentException.ThrowIfNullOrWhiteSpace(outFile);

        var gates = new List<GateRow>();
        var skillValue = new List<SkillValueRow>();
        var models = new SortedSet<string>(StringComparer.Ordinal);

        if (Directory.Exists(reportsDir))
        {
            foreach (var file in Directory.GetFiles(reportsDir, "*.json").OrderBy(f => f, StringComparer.Ordinal))
            {
                if (Path.GetFullPath(file) == Path.GetFullPath(outFile))
                    continue;
                await FoldReport(file, gates, skillValue, models, cancellationToken);
            }
        }

        var payload = new DashboardData(
            _clock.GetUtcNow().ToString("O"),
            models.ToList(),
            gates,
            skillValue);

        var json = JsonSerializer.Serialize(payload, WriteOptions);
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outFile))!);
        await File.WriteAllTextAsync(outFile, json, cancellationToken);
    }

    private static async Task FoldReport(
        string file, List<GateRow> gates, List<SkillValueRow> skillValue, SortedSet<string> models, CancellationToken cancellationToken)
    {
        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(await File.ReadAllTextAsync(file, cancellationToken));
        }
        catch (JsonException)
        {
            return; // a non-report json file is skipped, never throws
        }

        using (doc)
        {
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("scenarios", out var scenarios)
                || scenarios.ValueKind != JsonValueKind.Array)
            {
                return;
            }

            var skill = ReadString(root, "skill") ?? "unknown";
            var isGate = string.Equals(ReadString(root, "tab"), "gate", StringComparison.Ordinal);

            foreach (var scenario in scenarios.EnumerateArray())
            {
                var name = ReadString(scenario, "name") ?? "unknown";
                var model = ReadString(scenario, "model");
                var outputTokens = ReadLong(scenario, "outputTokens");
                var premiumRequests = ReadLong(scenario, "premiumRequests");
                var agentsInvoked = ReadLong(scenario, "agentsInvoked");
                var skillsInvoked = ReadLong(scenario, "skillsInvoked");
                if (model is not null)
                    models.Add(model);

                if (isGate)
                {
                    gates.Add(new GateRow(skill, name, ReadString(scenario, "status") ?? "UNKNOWN", model, outputTokens, premiumRequests, agentsInvoked, skillsInvoked));
                }
                else
                {
                    skillValue.Add(new SkillValueRow(skill, name, ReadString(scenario, "winner") ?? "Unknown", model, outputTokens, premiumRequests, agentsInvoked, skillsInvoked));
                }
            }
        }
    }

    private static string? ReadString(JsonElement element, string property)
        => element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static long? ReadLong(JsonElement element, string property)
        => element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.Number
            && value.TryGetInt64(out var number)
            ? number
            : null;

    private sealed record DashboardData(
        string GeneratedAt,
        IReadOnlyList<string> Models,
        IReadOnlyList<GateRow> Gates,
        IReadOnlyList<SkillValueRow> SkillValue);

    private sealed record GateRow(
        string Skill, string Scenario, string Status, string? Model, long? OutputTokens, long? PremiumRequests,
        long? AgentsInvoked, long? SkillsInvoked);

    private sealed record SkillValueRow(
        string Skill, string Scenario, string Winner, string? Model, long? OutputTokens, long? PremiumRequests,
        long? AgentsInvoked, long? SkillsInvoked);
}
