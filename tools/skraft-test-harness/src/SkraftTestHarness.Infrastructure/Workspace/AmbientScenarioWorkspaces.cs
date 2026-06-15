using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Infrastructure.Workspace;

/// <summary>
/// <see cref="IScenarioWorkspaces"/> that provisions nothing: the agent
/// runs in the ambient working directory. Used by the chained mode,
/// where a single persistent git worktree IS the workspace across all
/// phases (the output of phase N must remain visible to phase N+1), so
/// no per-scenario clone is created.
/// </summary>
public sealed class AmbientScenarioWorkspaces : IScenarioWorkspaces
{
    public ProvisionedWorkspace? ProvisionFor(Scenario scenario) => null;
}
