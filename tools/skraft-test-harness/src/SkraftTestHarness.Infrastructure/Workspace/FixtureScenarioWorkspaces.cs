using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Infrastructure.Workspace;

/// <summary>
/// <see cref="IScenarioWorkspaces"/> adapter: clones the scenario's
/// declared fixture/checkpoint through
/// <see cref="FixtureWorkspaceProvisioner"/> and bundles a
/// <see cref="FileSystemWorkspaceProbe"/> rooted at the clone. Owns
/// the provisioner's lifetime (clones are deleted on dispose).
/// </summary>
public sealed class FixtureScenarioWorkspaces : IScenarioWorkspaces, IDisposable
{
    private readonly FixtureWorkspaceProvisioner _provisioner;

    public FixtureScenarioWorkspaces(string fixturesRoot)
    {
        _provisioner = new FixtureWorkspaceProvisioner(fixturesRoot);
    }

    public ProvisionedWorkspace? ProvisionFor(Scenario scenario)
    {
        ArgumentNullException.ThrowIfNull(scenario);

        var declared = false;
        scenario.WithWorkspace((_, _, _) => declared = true);
        if (!declared)
            return null;

        string? root = null;
        scenario.WithWorkspace((fixture, baseline, checkpoint) =>
            root = _provisioner.Provision(WorkspaceRequirement.FromFixture(fixture, baseline, checkpoint)));

        return new ProvisionedWorkspace(root!, new FileSystemWorkspaceProbe(root!));
    }

    public void Dispose() => _provisioner.Dispose();
}
