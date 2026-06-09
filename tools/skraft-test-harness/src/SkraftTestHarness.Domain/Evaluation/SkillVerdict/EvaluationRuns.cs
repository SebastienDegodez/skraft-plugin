namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// First-class collection of <see cref="EvaluationRun"/> — enforces the
/// invariant "a verdict is built from at least one run".
/// </summary>
public sealed class EvaluationRuns
{
    private readonly IReadOnlyList<EvaluationRun> _items;

    public EvaluationRuns(IReadOnlyList<EvaluationRun> items)
    {
        if (items is null)
            throw new ArgumentNullException(nameof(items));
        if (items.Count == 0)
            throw new ArgumentException("At least one evaluation run is required.", nameof(items));

        _items = items;
    }

    internal int Count() => _items.Count;

    internal bool ContainsRun(RunMode mode, AgentOutput output)
        => _items.Any(r => r.Matches(mode, output));

    public void DetermineAssertionWinner(Action<Winner> onDecided)
    {
        ScenarioOutcome? withSkillOutcome = null;
        ScenarioOutcome? baselineOutcome = null;

        foreach (var run in _items)
        {
            if (run.IsMode(RunMode.Isolated))
                run.WithOutcome(o => withSkillOutcome = o);
            if (run.IsMode(RunMode.Baseline))
                run.WithOutcome(o => baselineOutcome = o);
        }

        if (withSkillOutcome is null || baselineOutcome is null)
        {
            onDecided(Winner.Tie);
            return;
        }

        if (withSkillOutcome.Beats(baselineOutcome))
            onDecided(Winner.WithSkill);
        else if (baselineOutcome.Beats(withSkillOutcome))
            onDecided(Winner.Baseline);
        else
            onDecided(Winner.Tie);
    }
}
