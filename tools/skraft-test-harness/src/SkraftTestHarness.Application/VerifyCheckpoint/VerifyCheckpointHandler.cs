using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Application.VerifyCheckpoint;

/// <summary>
/// Application use case: the checkpoint conformance contract. For each
/// scenario declaring a workspace, provisions the committed checkpoint
/// and evaluates ONLY the file assertions against it — no agent run,
/// no LLM. Keeps phase N starting files aligned with what phase N-1 is
/// supposed to produce when artefact formats evolve.
/// </summary>
public sealed class VerifyCheckpointHandler
{
    private readonly IScenarioWorkspaces _workspaces;

    public VerifyCheckpointHandler(IScenarioWorkspaces workspaces)
    {
        _workspaces = workspaces ?? throw new ArgumentNullException(nameof(workspaces));
    }

    public VerifyCheckpointReport Handle(Scenarios scenarios)
    {
        ArgumentNullException.ThrowIfNull(scenarios);

        var lines = new List<string>();
        var conformant = true;
        scenarios.ForEach(scenario => conformant &= VerifyOne(scenario, lines));
        return new VerifyCheckpointReport(lines, conformant);
    }

    private bool VerifyOne(Scenario scenario, List<string> lines)
    {
        var name = string.Empty;
        scenario.WithName(n => name = n);

        var provisioned = _workspaces.ProvisionFor(scenario);
        if (provisioned is null)
        {
            lines.Add($"skipped: {name} (no workspace declaration)");
            return true;
        }

        var view = scenario.CollectProbeRequests().ResolveWith(
            provisioned.Probe.Exists,
            provisioned.Probe.AnyMatches,
            provisioned.Probe.AnyMatchContains);
        var results = scenario.VerifyWorkspaceAssertions(view);

        if (results.AreAllPassing())
        {
            lines.Add($"conformant: {name} ({results.Count()} file assertion(s))");
            return true;
        }

        lines.Add($"DRIFTED: {name}");
        results.WithFailures(failure => lines.Add($"  {failure}"));
        return false;
    }
}

/// <summary>Outcome of a checkpoint verification: renderable lines + overall conformance.</summary>
public sealed record VerifyCheckpointReport(IReadOnlyList<string> Lines, bool IsConformant);
