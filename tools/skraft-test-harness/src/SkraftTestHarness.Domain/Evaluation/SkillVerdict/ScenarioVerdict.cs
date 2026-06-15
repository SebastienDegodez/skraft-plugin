namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Per-scenario verdict inside a <see cref="SkillVerdict"/>: the
/// scenario being judged, the runs that were recorded for it, and the
/// pairwise judge decision.
/// </summary>
public sealed class ScenarioVerdict
{
    private readonly Scenario _scenario;
    private readonly JudgedRuns _judgedRuns;
    private readonly RunTelemetry _telemetry;

    public ScenarioVerdict(Scenario scenario, JudgedRuns judgedRuns)
        : this(scenario, judgedRuns, RunTelemetry.None())
    {
    }

    public ScenarioVerdict(Scenario scenario, JudgedRuns judgedRuns, RunTelemetry telemetry)
    {
        _scenario = scenario ?? throw new ArgumentNullException(nameof(scenario));
        _judgedRuns = judgedRuns ?? throw new ArgumentNullException(nameof(judgedRuns));
        _telemetry = telemetry ?? throw new ArgumentNullException(nameof(telemetry));
    }

    internal bool IsFor(ScenarioName name) => _scenario.IsNamed(name);

    internal bool HasWinner(Winner winner) => _judgedRuns.WasWonBy(winner);

    internal bool HasReason(JudgeReason reason) => _judgedRuns.HasReason(reason);

    internal bool HasRunCount(int expected) => _judgedRuns.CountOfRuns() == expected;

    internal bool ContainsRun(RunMode mode, AgentOutput output)
        => _judgedRuns.ContainsRun(mode, output);

    internal void AccumulateWinner(Action<Winner> use) => _judgedRuns.WithWinner(use);

    internal void RenderTo(IVerdictRenderer renderer)
        => _scenario.WithName(name =>
        {
            _judgedRuns.WithDecision((winner, reason) =>
                renderer.OnScenarioVerdict(name, winner, reason));
            renderer.OnScenarioTelemetry(name, _telemetry);
        });
}
