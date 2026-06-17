namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// The full result of a single agent run: the produced output, the
/// tools invoked during the run, and the run's telemetry (model, output
/// tokens, AIC).
/// </summary>
public sealed class AgentRunResult
{
    private readonly AgentOutput _output;
    private readonly ToolInvocations _tools;
    private readonly RunTelemetry _telemetry;

    public AgentRunResult(AgentOutput output, ToolInvocations tools)
        : this(output, tools, RunTelemetry.None())
    {
    }

    public AgentRunResult(AgentOutput output, ToolInvocations tools, RunTelemetry telemetry)
    {
        _output = output ?? throw new ArgumentNullException(nameof(output));
        _tools = tools ?? throw new ArgumentNullException(nameof(tools));
        _telemetry = telemetry ?? throw new ArgumentNullException(nameof(telemetry));
    }

    public static AgentRunResult OutputOnly(AgentOutput output)
        => new(output, ToolInvocations.None());

    public AgentOutput Output() => _output;

    internal bool HasInvoked(ToolName tool) => _tools.Includes(tool);

    public void WithTelemetry(Action<RunTelemetry> use) => use(_telemetry);

    public ScenarioOutcome EvaluatedBy(Scenario scenario, WorkspaceView workspaceView)
        => scenario.EvaluateAgainst(this, workspaceView);
}
