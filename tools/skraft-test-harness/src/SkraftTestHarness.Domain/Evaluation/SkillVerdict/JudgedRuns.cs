namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Bundles the runs of a skill evaluation with the pairwise judge
/// decision that compared them, so a <see cref="SkillVerdict"/> can
/// reason about a scenario's runs and their outcome as one unit.
/// </summary>
public sealed class JudgedRuns
{
    private readonly EvaluationRuns _runs;
    private readonly JudgeDecision _decision;

    public JudgedRuns(EvaluationRuns runs, JudgeDecision decision)
    {
        _runs = runs ?? throw new ArgumentNullException(nameof(runs));
        _decision = decision ?? throw new ArgumentNullException(nameof(decision));
    }

    internal bool WasWonBy(Winner winner) => _decision.WasWonBy(winner);

    internal bool HasReason(JudgeReason reason) => _decision.HasReason(reason);

    internal int CountOfRuns() => _runs.Count();

    internal bool ContainsRun(RunMode mode, AgentOutput output)
        => _runs.ContainsRun(mode, output);

    internal void WithWinner(Action<Winner> use) => _decision.WithWinner(use);

    internal void WithDecision(Action<string, string> use) => _decision.WithWinnerAndReason(use);
}
