using System.Globalization;
using System.Text.Json;
using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Infrastructure.Reporting;

/// <summary>
/// Writes a <see cref="GateVerdict"/> as an indented JSON file named
/// <c>&lt;skill-id&gt;-&lt;UTC ISO no colons&gt;.json</c> into the
/// configured <see cref="ReportTarget"/>. Each scenario carries its
/// PASS/FAIL status and the run telemetry (model, output tokens, AIC),
/// so the dashboard can show the gates and their real cost.
/// </summary>
public sealed class GateJsonReporter
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly ReportTarget _target;
    private readonly TimeProvider _clock;

    public GateJsonReporter(ReportTarget target, TimeProvider clock)
    {
        _target = target ?? throw new ArgumentNullException(nameof(target));
        _clock = clock ?? throw new ArgumentNullException(nameof(clock));
    }

    public async Task EmitAsync(string skillId, GateVerdict verdict, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(skillId);
        ArgumentNullException.ThrowIfNull(verdict);

        var scenarios = new List<ScenarioPayload>();
        verdict.RenderEach((name, status, telemetry) =>
        {
            string? model = null;
            long? outputTokens = null;
            long? premiumRequests = null;
            long? agentsInvoked = null;
            long? skillsInvoked = null;
            telemetry.WithModel(m => model = m);
            telemetry.WithOutputTokens(o => outputTokens = o);
            telemetry.WithPremiumRequests(p => premiumRequests = p);
            telemetry.WithAgentsInvoked(a => agentsInvoked = a);
            telemetry.WithSkillsInvoked(s => skillsInvoked = s);
            scenarios.Add(new ScenarioPayload(name, status, model, outputTokens, premiumRequests, agentsInvoked, skillsInvoked));
        });

        var payload = new GatePayload("gate", skillId, scenarios);
        var fileName = $"{skillId}-{Timestamp()}.json";
        var path = _target.ResolveFilePath(fileName);
        var json = JsonSerializer.Serialize(payload, SerializerOptions);
        await File.WriteAllTextAsync(path, json, cancellationToken);
    }

    private string Timestamp()
        => _clock.GetUtcNow().ToString("yyyy-MM-ddTHHmmssZ", CultureInfo.InvariantCulture);

    private sealed record GatePayload(string Tab, string Skill, IReadOnlyList<ScenarioPayload> Scenarios);

    private sealed record ScenarioPayload(
        string Name, string Status, string? Model, long? OutputTokens, long? PremiumRequests,
        long? AgentsInvoked, long? SkillsInvoked);
}
