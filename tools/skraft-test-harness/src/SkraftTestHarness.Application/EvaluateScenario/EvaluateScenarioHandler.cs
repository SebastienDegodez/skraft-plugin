using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Application.EvaluateScenario;

/// <summary>
/// Application use case: runs a single scenario through the agent and
/// evaluates its declared assertions. Workspace-aware assertions
/// (<see cref="FileExists"/>, <see cref="FileMatchesGlob"/>,
/// <see cref="FileContains"/>) are supported by resolving the probes
/// they declare through <see cref="IWorkspaceProbe"/> AFTER the agent
/// ran — so files the agent created are visible — and handing the
/// resulting <see cref="WorkspaceView"/> snapshot to Domain so
/// evaluation itself stays IO-free.
/// </summary>
public sealed class EvaluateScenarioHandler
{
    private readonly IAgentRunner _agentRunner;
    private readonly IWorkspaceProbe _workspaceProbe;

    public EvaluateScenarioHandler(IAgentRunner agentRunner, IWorkspaceProbe workspaceProbe)
    {
        _agentRunner = agentRunner ?? throw new ArgumentNullException(nameof(agentRunner));
        _workspaceProbe = workspaceProbe ?? throw new ArgumentNullException(nameof(workspaceProbe));
    }

    public async Task<ScenarioOutcome> Handle(EvaluateScenarioCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var result = await _agentRunner.RunAsync(command.Scenario, RunMode.Isolated, cancellationToken);
        var workspaceView = BuildWorkspaceView(command.Scenario);
        return result.EvaluatedBy(command.Scenario, workspaceView);
    }

    private WorkspaceView BuildWorkspaceView(Scenario scenario)
        => scenario.CollectProbeRequests().ResolveWith(
            _workspaceProbe.Exists,
            _workspaceProbe.AnyMatches,
            _workspaceProbe.AnyMatchContains);
}
