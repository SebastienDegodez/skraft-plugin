namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Per-scenario entry of a <see cref="GateVerdict"/>: pairs a scenario
/// with its absolute <see cref="GateOutcome"/>.
/// </summary>
public sealed class GateScenarioVerdict
{
    private readonly Scenario _scenario;
    private readonly GateOutcome _outcome;

    public GateScenarioVerdict(Scenario scenario, GateOutcome outcome)
    {
        _scenario = scenario ?? throw new ArgumentNullException(nameof(scenario));
        _outcome = outcome ?? throw new ArgumentNullException(nameof(outcome));
    }

    internal bool IsPass() => _outcome.IsPass();

    /// <summary>Provides the scenario name and its PASS/FAIL status to the caller.</summary>
    internal void RenderTo(Action<string, string> onScenarioStatus)
        => _scenario.WithName(name => _outcome.WithStatus(status => onScenarioStatus(name, status)));
}
