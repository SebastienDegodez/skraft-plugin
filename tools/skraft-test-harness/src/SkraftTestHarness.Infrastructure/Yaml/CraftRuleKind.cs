using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Infrastructure.Yaml;

/// <summary>
/// One craft-rule kind: a predicate deciding whether a parsed rule
/// belongs to this kind (resolved by the keys it carries) and a builder
/// turning it into a Domain <see cref="CraftRule"/>. Adding a kind is a
/// single registration in <see cref="CraftRuleCatalog.Default"/> — the
/// engine and the loader stay untouched.
/// </summary>
public sealed class CraftRuleKind
{
    private readonly Func<IReadOnlyDictionary<string, object>, bool> _matches;
    private readonly Func<string, string, IReadOnlyDictionary<string, object>, CraftRule> _build;

    public CraftRuleKind(
        Func<IReadOnlyDictionary<string, object>, bool> matches,
        Func<string, string, IReadOnlyDictionary<string, object>, CraftRule> build)
    {
        _matches = matches ?? throw new ArgumentNullException(nameof(matches));
        _build = build ?? throw new ArgumentNullException(nameof(build));
    }

    public bool Matches(IReadOnlyDictionary<string, object> rule) => _matches(rule);

    public CraftRule Build(string scenarioName, string id, IReadOnlyDictionary<string, object> rule)
        => _build(scenarioName, id, rule);

    /// <summary>
    /// <c>glob</c> + <c>contains</c>: some file matching the glob must
    /// contain the given text. Backs e.g. "an interface is declared under
    /// Application/Domain".
    /// </summary>
    public static CraftRuleKind ContainsRule() => new(
        rule => rule.ContainsKey("glob") && rule.ContainsKey("contains"),
        (scenarioName, id, rule) => new CraftRule(
            id,
            new FileContains(
                new GlobPattern(RuleField(scenarioName, id, rule, "glob")),
                new Needle(RuleField(scenarioName, id, rule, "contains")))));

    /// <summary>
    /// <c>glob</c> + <c>matches</c>: some file matching the glob must have
    /// content matching the regex. Backs e.g. "a gateway/repository
    /// implementation lives in Infrastructure".
    /// </summary>
    public static CraftRuleKind MatchesRule() => new(
        rule => rule.ContainsKey("glob") && rule.ContainsKey("matches"),
        (scenarioName, id, rule) => new CraftRule(
            id,
            new FileContentMatches(
                new GlobPattern(RuleField(scenarioName, id, rule, "glob")),
                new RegexPattern(RuleField(scenarioName, id, rule, "matches")))));

    /// <summary>
    /// <c>quality_gate</c>: a quality-gates evidence log (qg-*.json)
    /// matching <c>evidence</c> attests <c>gate_id</c> with status
    /// <c>pass</c>. Proves e.g. mutation testing actually ran and passed.
    /// </summary>
    public static CraftRuleKind QualityGateRule() => new(
        rule => rule.ContainsKey("quality_gate"),
        (scenarioName, id, rule) =>
        {
            var fields = NestedFields(scenarioName, id, rule["quality_gate"]);
            return new CraftRule(
                id,
                new QualityGatePassed(
                    new GlobPattern(NestedField(scenarioName, id, fields, "evidence")),
                    new GateId(NestedField(scenarioName, id, fields, "gate_id"))));
        });

    private static IReadOnlyDictionary<string, string> NestedFields(string scenarioName, string id, object value)
    {
        if (value is not IDictionary<object, object> raw)
        {
            throw new ArgumentException(
                $"Scenario '{scenarioName}': craft rule '{id}' field 'quality_gate' must be a mapping with 'evidence' and 'gate_id'.");
        }

        var fields = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var (k, v) in raw)
        {
            if (k is string name && v is string text)
                fields[name] = text;
        }
        return fields;
    }

    private static string NestedField(
        string scenarioName, string id, IReadOnlyDictionary<string, string> fields, string field)
    {
        if (fields.TryGetValue(field, out var value) && !string.IsNullOrEmpty(value))
            return value;
        throw new ArgumentException(
            $"Scenario '{scenarioName}': craft rule '{id}' is missing required field '{field}'.");
    }

    internal static string RuleField(
        string scenarioName, string id, IReadOnlyDictionary<string, object> rule, string field)
    {
        if (rule.TryGetValue(field, out var value) && value is string text && !string.IsNullOrEmpty(text))
            return text;
        throw new ArgumentException(
            $"Scenario '{scenarioName}': craft rule '{id}' is missing required field '{field}'.");
    }
}
