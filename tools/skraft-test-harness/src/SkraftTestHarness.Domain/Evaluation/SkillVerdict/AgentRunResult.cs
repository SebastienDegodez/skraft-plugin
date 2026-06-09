namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Full result of a single agent run: the produced output plus the
/// tools invoked during the run. Carries exactly two instance
/// variables (Object Calisthenics rule 8).
/// </summary>
public sealed class AgentRunResult
{
    private readonly AgentOutput _output;
    private readonly ToolInvocations _tools;

    public AgentRunResult(AgentOutput output, ToolInvocations tools)
    {
        _output = output ?? throw new ArgumentNullException(nameof(output));
        _tools = tools ?? throw new ArgumentNullException(nameof(tools));
    }

    public static AgentRunResult OutputOnly(AgentOutput output)
        => new(output, ToolInvocations.None());

    public AgentOutput Output() => _output;

    internal bool HasInvoked(ToolName tool) => _tools.Includes(tool);

    public ScenarioOutcome EvaluatedBy(Scenario scenario, WorkspaceView workspaceView)
        => scenario.EvaluateAgainst(this, workspaceView);
}
