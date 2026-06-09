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
