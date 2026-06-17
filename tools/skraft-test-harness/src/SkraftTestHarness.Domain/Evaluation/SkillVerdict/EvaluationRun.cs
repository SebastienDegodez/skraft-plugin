namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>A single recorded run of a scenario in a given <see cref="RunMode"/>.</summary>
public sealed class EvaluationRun
{
    private readonly RunMode _mode;
    private readonly ScenarioOutcome _outcome;

    public EvaluationRun(RunMode mode, ScenarioOutcome outcome)
    {
        _mode = mode;
        _outcome = outcome ?? throw new ArgumentNullException(nameof(outcome));
    }

    internal bool Matches(RunMode mode, AgentOutput output)
        => _mode == mode && _outcome.HasOutput(output);

    internal bool IsMode(RunMode mode) => _mode == mode;

    internal void WithOutcome(Action<ScenarioOutcome> probe) => probe(_outcome);
}
