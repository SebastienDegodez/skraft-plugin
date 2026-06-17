using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Application.Gateways;

/// <summary>
/// Output gateway : provisions the workspace a scenario declares
/// (<c>workspace: { fixture, checkpoint }</c>) into a fresh clone for
/// ONE run, bundled with a probe rooted at that clone. Returns
/// <c>null</c> when the scenario declares no workspace. Called once
/// per run mode so baseline and with-skill never share state.
/// </summary>
public interface IScenarioWorkspaces
{
    ProvisionedWorkspace? ProvisionFor(Scenario scenario);
}

/// <summary>A provisioned clone: its root (handed to the agent runner) and a probe rooted at it.</summary>
public sealed record ProvisionedWorkspace(string Root, IWorkspaceProbe Probe);
