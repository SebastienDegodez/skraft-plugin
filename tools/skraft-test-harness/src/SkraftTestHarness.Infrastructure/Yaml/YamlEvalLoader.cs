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
    private const string DefaultEvalFileName = "eval.yaml";

    private readonly string _evalFileName;

    /// <summary>Targets <c>eval.yaml</c> (the comparative <c>evaluate</c> suite).</summary>
    public YamlEvalLoader() : this(DefaultEvalFileName)
    {
    }

    /// <summary>
    /// Targets a specific eval filename — e.g. <c>eval.skraft.yml</c> for
    /// the absolute gate suite, keeping it distinct from <c>eval.yaml</c>.
    /// </summary>
    public YamlEvalLoader(string evalFileName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(evalFileName);
        _evalFileName = evalFileName;
    }

    public async Task<Scenarios> LoadAsync(string testsDirectory, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(testsDirectory);

        var path = Path.Combine(testsDirectory, _evalFileName);
        if (!File.Exists(path))
        {
            throw new FileNotFoundException(
                $"No {_evalFileName} found in tests directory '{testsDirectory}'.",
                path);
        }

        var yaml = await File.ReadAllTextAsync(path, cancellationToken).ConfigureAwait(false);

        var deserializer = new DeserializerBuilder()
            .WithNamingConvention(UnderscoredNamingConvention.Instance)
            .IgnoreUnmatchedProperties()
            .Build();

        var dto = deserializer.Deserialize<EvalYamlDto>(yaml)
            ?? throw new InvalidDataException($"'{path}' is empty or not a valid eval document.");

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
            "artifact_contract" => ToArtifactContract(scenarioName, value),
            "craft_conformance" => ToCraftConformance(scenarioName, value),
            _ => throw new ArgumentException(
                $"Scenario '{scenarioName}': unknown assertion kind '{key}'. "
                + "Supported: output_contains, output_not_contains, output_matches, output_not_matches, "
                + "file_exists, file_matches_glob, file_contains, file_judge, output_judge, artifact_contract, craft_conformance."),
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

    private static ArtifactContract ToArtifactContract(string scenarioName, object value)
    {
        if (value is not IDictionary<object, object> raw)
        {
            throw new ArgumentException(
                $"Scenario '{scenarioName}': assertion 'artifact_contract' must be a mapping with 'consumer' and 'requires'.");
        }

        if (!raw.TryGetValue("consumer", out var consumerValue) || consumerValue is not string consumer || string.IsNullOrWhiteSpace(consumer))
        {
            throw new ArgumentException(
                $"Scenario '{scenarioName}': assertion 'artifact_contract' is missing required field 'consumer'.");
        }

        if (!raw.TryGetValue("requires", out var requiresValue) || requiresValue is not IList<object> requires || requires.Count == 0)
        {
            throw new ArgumentException(
                $"Scenario '{scenarioName}': assertion 'artifact_contract' requires a non-empty 'requires' list.");
        }

        var requirements = requires
            .Select(item => ToArtifactRequirement(scenarioName, item))
            .ToList();

        return new ArtifactContract(new Consumer(consumer), requirements);
    }

    private static Assertion ToArtifactRequirement(string scenarioName, object item)
    {
        if (item is not IDictionary<object, object> raw)
        {
            throw new ArgumentException(
                $"Scenario '{scenarioName}': each 'artifact_contract' requirement must be a mapping with a 'glob' (and optional 'contains').");
        }

        if (!raw.TryGetValue("glob", out var globValue) || globValue is not string glob || string.IsNullOrWhiteSpace(glob))
        {
            throw new ArgumentException(
                $"Scenario '{scenarioName}': an 'artifact_contract' requirement is missing required field 'glob'.");
        }

        var pattern = new GlobPattern(glob);
        if (raw.TryGetValue("contains", out var containsValue) && containsValue is string contains && !string.IsNullOrEmpty(contains))
            return new FileContains(pattern, new Needle(contains));
        return new FileMatchesGlob(pattern);
    }

    private static CraftConformance ToCraftConformance(string scenarioName, object value)
    {
        if (value is not IDictionary<object, object> raw
            || !raw.TryGetValue("rules", out var rulesValue)
            || rulesValue is not IList<object> rules
            || rules.Count == 0)
        {
            throw new ArgumentException(
                $"Scenario '{scenarioName}': assertion 'craft_conformance' requires a non-empty 'rules' list.");
        }

        var catalog = CraftRuleCatalog.Default();
        var craftRules = rules
            .Select(item => catalog.Resolve(scenarioName, NormalizeRule(scenarioName, item)))
            .ToList();

        return new CraftConformance(craftRules);
    }

    private static IReadOnlyDictionary<string, object> NormalizeRule(string scenarioName, object item)
    {
        if (item is not IDictionary<object, object> raw)
        {
            throw new ArgumentException(
                $"Scenario '{scenarioName}': each 'craft_conformance' rule must be a mapping (id + kind-specific keys).");
        }

        var fields = new Dictionary<string, object>(StringComparer.Ordinal);
        foreach (var (k, v) in raw)
        {
            if (k is string name)
                fields[name] = v;
        }
        return fields;
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
