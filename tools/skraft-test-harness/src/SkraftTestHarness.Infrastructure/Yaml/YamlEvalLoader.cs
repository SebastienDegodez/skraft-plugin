using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace SkraftTestHarness.Infrastructure.Yaml;

/// <summary>
/// <see cref="IScenarioLoader"/> adapter that reads an
/// <c>eval.yaml</c> file from a tests directory and maps it to the
/// Domain <see cref="Scenarios"/> first-class collection. DTOs are
/// confined to Infrastructure and never leak into Domain/Application.
/// </summary>
public sealed class YamlEvalLoader : IScenarioLoader
{
    private const string EvalFileName = "eval.yaml";

    public async Task<Scenarios> LoadAsync(string testsDirectory, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(testsDirectory);

        var path = Path.Combine(testsDirectory, EvalFileName);
        if (!File.Exists(path))
        {
            throw new FileNotFoundException(
                $"No {EvalFileName} found in tests directory '{testsDirectory}'.",
                path);
        }

        var yaml = await File.ReadAllTextAsync(path, cancellationToken).ConfigureAwait(false);

        var deserializer = new DeserializerBuilder()
            .WithNamingConvention(UnderscoredNamingConvention.Instance)
            .IgnoreUnmatchedProperties()
            .Build();

        var dto = deserializer.Deserialize<EvalYamlDto>(yaml)
            ?? throw new InvalidDataException($"'{path}' is empty or not a valid eval.yaml document.");

        var scenarios = (dto.Scenarios ?? [])
            .Select(ToScenario)
            .ToList();

        return new Scenarios(scenarios);
    }

    private static Scenario ToScenario(ScenarioDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            throw new ArgumentException("Scenario 'name' is required.");
        if (string.IsNullOrWhiteSpace(dto.Prompt))
            throw new ArgumentException($"Scenario '{dto.Name}' is missing 'prompt'.");

        var assertions = (dto.Assertions ?? [])
            .Select(a => ToAssertion(dto.Name!, a))
            .ToList();

        return Scenario.Create(dto.Name!, dto.Prompt!, assertions);
    }

    private static Assertion ToAssertion(string scenarioName, AssertionDto dto)
    {
        if (dto.Count != 1)
        {
            throw new ArgumentException(
                $"Scenario '{scenarioName}': each assertion must have exactly one key (got {dto.Count}).");
        }

        var (key, value) = dto.Single();
        if (string.IsNullOrEmpty(value))
        {
            throw new ArgumentException(
                $"Scenario '{scenarioName}': assertion '{key}' must have a non-empty value.");
        }

        return key switch
        {
            "output_contains" => new OutputContains(new Needle(value)),
            "output_not_contains" => new OutputNotContains(new Needle(value)),
            "output_matches" => new OutputMatches(new RegexPattern(value)),
            "output_not_matches" => new OutputNotMatches(new RegexPattern(value)),
            // TODO: support "file_exists" — wire FileExists assertion via IWorkspaceProbe (follow-up slice).
            _ => throw new ArgumentException(
                $"Scenario '{scenarioName}': unknown assertion kind '{key}'. "
                + "Supported: output_contains, output_not_contains, output_matches, output_not_matches."),
        };
    }
}
