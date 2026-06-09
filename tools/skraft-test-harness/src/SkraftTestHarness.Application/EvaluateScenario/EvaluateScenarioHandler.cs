using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Application.EvaluateScenario;

/// <summary>
/// Application use case: runs a single scenario through the agent and
/// evaluates its declared assertions. Workspace-aware assertions
/// (<see cref="FileExists"/>) are supported by pre-resolving the
/// <see cref="FilePath"/>s they declare through <see cref="IWorkspaceProbe"/>
/// and handing the resulting <see cref="WorkspaceView"/> snapshot to
/// Domain so evaluation itself stays IO-free.
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
        var workspaceView = BuildWorkspaceView(command.Scenario);
        var result = await _agentRunner.RunAsync(command.Scenario, RunMode.Isolated, cancellationToken);
        return result.EvaluatedBy(command.Scenario, workspaceView);
    }

    private WorkspaceView BuildWorkspaceView(Scenario scenario)
    {
        var declared = scenario.CollectDeclaredFilePaths();
        if (declared.Count == 0)
            return WorkspaceView.Empty();

        var probed = new Dictionary<FilePath, bool>(declared.Count);
        foreach (var path in declared)
            probed[path] = _workspaceProbe.Exists(path);
        return new WorkspaceView(probed);
    }
}
