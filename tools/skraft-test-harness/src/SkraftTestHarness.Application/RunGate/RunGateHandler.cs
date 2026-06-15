using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Application.RunGate;

/// <summary>
/// Application use case for the absolute workflow gate: runs each
/// scenario <b>once</b> (<see cref="RunMode.Isolated"/> — the agent is
/// loaded), resolves its assertions against the produced workspace, and
/// reports an absolute <see cref="GateVerdict"/>. No baseline run, no
/// pairwise judge — a gate either holds or it does not.
/// </summary>
public sealed class RunGateHandler
{
    private readonly IAgentRunner _agentRunner;
    private readonly IWorkspaceProbe _workspaceProbe;
    private readonly IAssertionJudge _assertionJudge;
    private readonly IScenarioWorkspaces _scenarioWorkspaces;

    public RunGateHandler(
        IAgentRunner agentRunner,
        IWorkspaceProbe workspaceProbe,
        IAssertionJudge assertionJudge,
        IScenarioWorkspaces scenarioWorkspaces)
    {
        _agentRunner = agentRunner ?? throw new ArgumentNullException(nameof(agentRunner));
        _workspaceProbe = workspaceProbe ?? throw new ArgumentNullException(nameof(workspaceProbe));
        _assertionJudge = assertionJudge ?? throw new ArgumentNullException(nameof(assertionJudge));
        _scenarioWorkspaces = scenarioWorkspaces ?? throw new ArgumentNullException(nameof(scenarioWorkspaces));
    }

    public Task<GateVerdict> Handle(RunGateCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        return command.Scenarios.EvaluateGateEachAsync(
            scenario => EvaluateOneScenario(scenario, cancellationToken));
    }

    /// <summary>
    /// One agent run: provisions the declared workspace (when any) so the
    /// run executes in its own clone, then resolves assertions against that
    /// same clone AFTER the run.
    /// </summary>
    private async Task<GateScenarioVerdict> EvaluateOneScenario(Scenario scenario, CancellationToken cancellationToken)
    {
        var provisioned = _scenarioWorkspaces.ProvisionFor(scenario);

        var result = provisioned is null
            ? await _agentRunner.RunAsync(scenario, RunMode.Isolated, cancellationToken)
            : await _agentRunner.RunInWorkspaceAsync(scenario, RunMode.Isolated, provisioned.Root, cancellationToken);

        var probe = provisioned?.Probe ?? _workspaceProbe;
        var view = await BuildWorkspaceView(scenario, result, probe, cancellationToken);
        var outcome = result.EvaluatedBy(scenario, view);
        return new GateScenarioVerdict(scenario, GateOutcome.From(outcome));
    }

    private Task<WorkspaceView> BuildWorkspaceView(
        Scenario scenario, AgentRunResult runResult, IWorkspaceProbe probe, CancellationToken cancellationToken)
        => scenario.CollectProbeRequests().ResolveWith(
            probe.Exists,
            probe.AnyMatches,
            probe.AnyMatchContains,
            (pattern, criterion) => _assertionJudge.JudgeFilesAsync(pattern, criterion, cancellationToken),
            criterion => _assertionJudge.JudgeOutputAsync(runResult.Output(), criterion, cancellationToken));
}
