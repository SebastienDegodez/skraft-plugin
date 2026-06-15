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

    internal static string RuleField(
        string scenarioName, string id, IReadOnlyDictionary<string, object> rule, string field)
    {
        if (rule.TryGetValue(field, out var value) && value is string text && !string.IsNullOrEmpty(text))
            return text;
        throw new ArgumentException(
            $"Scenario '{scenarioName}': craft rule '{id}' is missing required field '{field}'.");
    }
}
