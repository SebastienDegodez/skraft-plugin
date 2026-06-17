using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Infrastructure.Yaml;

/// <summary>
/// Extensible registry of <see cref="CraftRuleKind"/>. Resolves a parsed
/// craft rule into a Domain <see cref="CraftRule"/> by asking each kind,
/// in order, whether it recognises the rule's keys. The set of rules is
/// expected to grow substantially: a new rule kind is a single entry in
/// <see cref="Default"/>, with no change to the loader or the evaluation
/// engine.
/// </summary>
public sealed class CraftRuleCatalog
{
    private readonly IReadOnlyList<CraftRuleKind> _kinds;

    private CraftRuleCatalog(IReadOnlyList<CraftRuleKind> kinds) => _kinds = kinds;

    public static CraftRuleCatalog Default() => new(new[]
    {
        CraftRuleKind.ContainsRule(),
        CraftRuleKind.MatchesRule(),
        CraftRuleKind.QualityGateRule(),
    });

    public CraftRule Resolve(string scenarioName, IReadOnlyDictionary<string, object> rule)
    {
        ArgumentNullException.ThrowIfNull(rule);

        if (!rule.TryGetValue("id", out var idValue) || idValue is not string id || string.IsNullOrWhiteSpace(id))
            throw new ArgumentException($"Scenario '{scenarioName}': each craft rule requires a non-empty 'id'.");

        foreach (var kind in _kinds)
        {
            if (kind.Matches(rule))
                return kind.Build(scenarioName, id, rule);
        }

        throw new ArgumentException(
            $"Scenario '{scenarioName}': craft rule '{id}' matches no known kind. "
            + "Supported rule kinds: glob+contains, glob+matches, quality_gate.");
    }
}
