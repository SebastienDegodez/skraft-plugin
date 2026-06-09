using System.Text.Json;
using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Domain.Skills;

namespace SkraftTestHarness.Infrastructure.Reporting;

/// <summary>
/// <see cref="IVerdictLoader"/> adapter: scans a flat directory for
/// <c>*.json</c> verdict files, deserializes each one and reconstitutes
/// the Domain <see cref="SkillVerdict"/> via the internal
/// <c>Reconstitute</c> factory — no public getters were added on Domain
/// types (Tell-Don't-Ask, Object Calisthenics rule 9).
/// </summary>
public sealed class JsonVerdictLoader : IVerdictLoader
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public async Task<IEnumerable<SkillVerdict>> LoadAllAsync(
        string directory, CancellationToken cancellationToken)
    {
        var files = Directory.GetFiles(directory, "*.json");
        var verdicts = new List<SkillVerdict>(files.Length);

        foreach (var file in files)
        {
            var json = await File.ReadAllTextAsync(file, cancellationToken);
            var dto = JsonSerializer.Deserialize<VerdictDto>(json, Options)!;
            verdicts.Add(dto.ToDomain());
        }

        return verdicts;
    }

    private sealed record VerdictDto(string Skill, IReadOnlyList<ScenarioVerdictDto> Scenarios)
    {
        internal SkillVerdict ToDomain()
        {
            var skill = new SkillReference(Skill);
            var scenarios = Scenarios.Select(
                s => (s.Name, Enum.Parse<Winner>(s.Winner), s.Reason));
            return SkillVerdict.Reconstitute(skill, scenarios);
        }
    }

    private sealed record ScenarioVerdictDto(string Name, string Winner, string Reason);
}
