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

        return Scenario.Create(dto.Name!, dto.Prompt!, dto.Tags ?? [], ToWorkspace(dto), assertions);
    }

    private static WorkspaceRequirement ToWorkspace(ScenarioDto dto)
    {
        if (dto.Workspace is null)
            return WorkspaceRequirement.None();
        if (string.IsNullOrWhiteSpace(dto.Workspace.Fixture))
        {
            throw new ArgumentException(
                $"Scenario '{dto.Name}': 'workspace' requires a non-empty 'fixture'.");
        }
        return WorkspaceRequirement.FromFixture(
            dto.Workspace.Fixture, dto.Workspace.Baseline, dto.Workspace.Checkpoint);
    }

    private static Assertion ToAssertion(string scenarioName, AssertionDto dto)
    {
        if (dto.Count != 1)
        {
            throw new ArgumentException(
                $"Scenario '{scenarioName}': each assertion must have exactly one key (got {dto.Count}).");
        }

        var (key, value) = dto.Single();
        return key switch
        {
            "output_contains" => new OutputContains(new Needle(Scalar(scenarioName, key, value))),
            "output_not_contains" => new OutputNotContains(new Needle(Scalar(scenarioName, key, value))),
            "output_matches" => new OutputMatches(new RegexPattern(Scalar(scenarioName, key, value))),
            "output_not_matches" => new OutputNotMatches(new RegexPattern(Scalar(scenarioName, key, value))),
            "file_exists" => new FileExists(new FilePath(Scalar(scenarioName, key, value))),
            "file_matches_glob" => new FileMatchesGlob(new GlobPattern(Scalar(scenarioName, key, value))),
            "file_contains" => ToFileContains(scenarioName, value),
            "file_judge" => ToFileJudge(scenarioName, value),
            "output_judge" => ToOutputJudge(scenarioName, value),
            _ => throw new ArgumentException(
                $"Scenario '{scenarioName}': unknown assertion kind '{key}'. "
                + "Supported: output_contains, output_not_contains, output_matches, output_not_matches, "
                + "file_exists, file_matches_glob, file_contains, file_judge, output_judge."),
        };
    }

    private static FileContains ToFileContains(string scenarioName, object value)
    {
        var fields = Mapping(scenarioName, "file_contains", value);
        return new FileContains(
            new GlobPattern(Field(scenarioName, "file_contains", fields, "glob")),
            new Needle(Field(scenarioName, "file_contains", fields, "text")));
    }

    private static FileJudge ToFileJudge(string scenarioName, object value)
    {
        var fields = Mapping(scenarioName, "file_judge", value);
        return new FileJudge(
            new GlobPattern(Field(scenarioName, "file_judge", fields, "glob")),
            new Criterion(Field(scenarioName, "file_judge", fields, "criterion")));
    }

    private static OutputJudge ToOutputJudge(string scenarioName, object value)
    {
        var fields = Mapping(scenarioName, "output_judge", value);
        return new OutputJudge(
            new Criterion(Field(scenarioName, "output_judge", fields, "criterion")));
    }

    private static string Scalar(string scenarioName, string key, object value)
    {
        if (value is string text && !string.IsNullOrEmpty(text))
            return text;
        throw new ArgumentException(
            $"Scenario '{scenarioName}': assertion '{key}' must have a non-empty string value.");
    }

    private static IReadOnlyDictionary<string, string> Mapping(string scenarioName, string key, object value)
    {
        if (value is not IDictionary<object, object> raw)
        {
            throw new ArgumentException(
                $"Scenario '{scenarioName}': assertion '{key}' must be a mapping (e.g. {key}: {{ glob: ..., ... }}).");
        }

        var fields = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var (k, v) in raw)
        {
            if (k is string name && v is string text)
                fields[name] = text;
        }
        return fields;
    }

    private static string Field(
        string scenarioName, string key, IReadOnlyDictionary<string, string> fields, string field)
    {
        if (fields.TryGetValue(field, out var value) && !string.IsNullOrEmpty(value))
            return value;
        throw new ArgumentException(
            $"Scenario '{scenarioName}': assertion '{key}' is missing required field '{field}'.");
    }
}
