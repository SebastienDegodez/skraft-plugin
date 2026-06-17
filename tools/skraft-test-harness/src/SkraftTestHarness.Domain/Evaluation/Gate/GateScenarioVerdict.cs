namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Per-scenario entry of a <see cref="GateVerdict"/>: pairs a scenario
/// with its absolute <see cref="GateOutcome"/> and the run telemetry.
/// </summary>
public sealed class GateScenarioVerdict
{
    private readonly Scenario _scenario;
    private readonly GateOutcome _outcome;
    private readonly RunTelemetry _telemetry;

    public GateScenarioVerdict(Scenario scenario, GateOutcome outcome)
        : this(scenario, outcome, RunTelemetry.None())
    {
    }

    public GateScenarioVerdict(Scenario scenario, GateOutcome outcome, RunTelemetry telemetry)
    {
        _scenario = scenario ?? throw new ArgumentNullException(nameof(scenario));
        _outcome = outcome ?? throw new ArgumentNullException(nameof(outcome));
        _telemetry = telemetry ?? throw new ArgumentNullException(nameof(telemetry));
    }

    internal bool IsPass() => _outcome.IsPass();

    /// <summary>Provides the scenario name, its PASS/FAIL status and the run telemetry to the caller.</summary>
    internal void RenderTo(Action<string, string, RunTelemetry> onScenario)
        => _scenario.WithName(name => _outcome.WithStatus(status => onScenario(name, status, _telemetry)));
}
