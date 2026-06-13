namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// First-class collection of <see cref="Scenario"/> — the scenarios
/// that make up a skill's evaluation suite. Hides iteration: callers
/// provide an async evaluator and receive the resulting
/// <see cref="ScenarioVerdicts"/>.
/// </summary>
public sealed class Scenarios
{
    private readonly IReadOnlyList<Scenario> _items;

    public Scenarios(IReadOnlyList<Scenario> items)
    {
        _items = items ?? throw new ArgumentNullException(nameof(items));
        if (_items.Count == 0)
        {
            throw new ArgumentException("A skill evaluation requires at least one scenario.", nameof(items));
        }
    }

    public int Count() => _items.Count;

    /// <summary>Hands each scenario to the callback without evaluating it (verify-checkpoint path).</summary>
    public void ForEach(Action<Scenario> use)
    {
        ArgumentNullException.ThrowIfNull(use);
        foreach (var scenario in _items)
            use(scenario);
    }

    /// <summary>
    /// Keeps only the scenarios accepted by the filter. Throws when the
    /// selection is empty — running zero scenarios is never meaningful.
    /// </summary>
    public Scenarios SelectByTags(TagFilter filter)
    {
        ArgumentNullException.ThrowIfNull(filter);
        var kept = _items.Where(s => s.MatchesTags(filter)).ToList();
        if (kept.Count == 0)
            throw new ArgumentException("No scenario matches the requested tags.", nameof(filter));
        return new Scenarios(kept);
    }

    public async Task<ScenarioVerdicts> EvaluateEachAsync(
        Func<Scenario, Task<ScenarioVerdict>> evaluator)
    {
        ArgumentNullException.ThrowIfNull(evaluator);
        var verdicts = new List<ScenarioVerdict>(_items.Count);
        foreach (var scenario in _items)
        {
            verdicts.Add(await evaluator(scenario));
        }
        return new ScenarioVerdicts(verdicts);
    }
}
