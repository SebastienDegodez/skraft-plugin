namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// The per-scenario verdicts that make up a single skill verdict, one
/// <see cref="ScenarioVerdict"/> per scenario evaluated for the skill.
/// </summary>
public sealed class ScenarioVerdicts
{
    private readonly IReadOnlyList<ScenarioVerdict> _items;

    public ScenarioVerdicts(IReadOnlyList<ScenarioVerdict> items)
    {
        _items = items ?? throw new ArgumentNullException(nameof(items));
        if (_items.Count == 0)
        {
            throw new ArgumentException("A skill verdict requires at least one scenario verdict.", nameof(items));
        }
    }

    internal int Count() => _items.Count;

    internal int Total() => _items.Count;

    internal bool AnyFor(ScenarioName name) => _items.Any(v => v.IsFor(name));

    internal bool AllWonBy(Winner winner) => _items.All(v => v.HasWinner(winner));

    internal int CountWonBy(Winner winner) => _items.Count(v => v.HasWinner(winner));

    internal bool WonByFor(ScenarioName name, Winner winner)
        => _items.Any(v => v.IsFor(name) && v.HasWinner(winner));

    internal bool HasReasonFor(ScenarioName name, JudgeReason reason)
        => _items.Any(v => v.IsFor(name) && v.HasReason(reason));

    internal bool HasRunCountFor(ScenarioName name, int expected)
        => _items.Any(v => v.IsFor(name) && v.HasRunCount(expected));

    internal bool ContainsRunFor(ScenarioName name, RunMode mode, AgentOutput output)
        => _items.Any(v => v.IsFor(name) && v.ContainsRun(mode, output));

    internal void AccumulateWinners(Action<Winner> onWinner)
    {
        foreach (var item in _items)
            item.AccumulateWinner(onWinner);
    }

    internal void RenderTo(IVerdictRenderer renderer)
    {
        foreach (var item in _items)
        {
            item.RenderTo(renderer);
        }
    }
}
