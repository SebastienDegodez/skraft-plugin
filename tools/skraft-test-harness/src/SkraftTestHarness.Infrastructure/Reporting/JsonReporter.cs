using System.Globalization;
using System.Text.Json;
using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Infrastructure.Reporting;

/// <summary>
/// Real <see cref="IReporter"/> adapter: writes the
/// <see cref="SkillVerdict"/> as an indented JSON file named
/// <c>&lt;skill-id&gt;-&lt;UTC ISO no colons&gt;.json</c> into the
/// configured <see cref="ReportTarget"/>. Renders the verdict through
/// the <see cref="IVerdictRenderer"/> the Domain provides.
/// </summary>
public sealed class JsonReporter : IReporter
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly ReportTarget _target;
    private readonly TimeProvider _clock;

    public JsonReporter(ReportTarget target, TimeProvider clock)
    {
        _target = target ?? throw new ArgumentNullException(nameof(target));
        _clock = clock ?? throw new ArgumentNullException(nameof(clock));
    }

    public async Task EmitAsync(SkillVerdict verdict, CancellationToken cancellationToken)
    {
        if (verdict is null) throw new ArgumentNullException(nameof(verdict));

        var collector = new VerdictCollector();
        verdict.RenderTo(collector);

        var fileName = $"{collector.Skill}-{Timestamp()}.json";
        var path = _target.ResolveFilePath(fileName);

        var json = JsonSerializer.Serialize(collector.ToPayload(), SerializerOptions);
        await File.WriteAllTextAsync(path, json, cancellationToken);
    }

    private string Timestamp()
        => _clock.GetUtcNow().ToString("yyyy-MM-ddTHHmmssZ", CultureInfo.InvariantCulture);

    private sealed class VerdictCollector : IVerdictRenderer
    {
        private string _skill = string.Empty;
        private readonly List<ScenarioPayload> _scenarios = new();

        internal string Skill => _skill;

        public void OnSkill(string skillId) => _skill = skillId;

        public void OnScenarioVerdict(string scenarioName, string winner, string reason)
            => _scenarios.Add(new ScenarioPayload(scenarioName, winner, reason));

        internal SkillPayload ToPayload() => new(_skill, _scenarios);
    }

    private sealed record SkillPayload(string Skill, IReadOnlyList<ScenarioPayload> Scenarios);

    private sealed record ScenarioPayload(string Name, string Winner, string Reason);
}
