namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Asserts a set of identified architecture rules
/// (<see cref="CraftRule"/>) against the produced workspace — the
/// craft-discipline gate for the software-engineer's output (interfaces
/// in Application/Domain, gateway impls in Infrastructure, mutation
/// testing run, …). Passes only when every rule holds. The rule set is
/// open-ended: new rules are added without changing this engine.
/// </summary>
public sealed class CraftConformance : Assertion
{
    private readonly IReadOnlyList<CraftRule> _rules;

    public CraftConformance(IReadOnlyList<CraftRule> rules)
    {
        _rules = rules ?? throw new ArgumentNullException(nameof(rules));
        if (_rules.Count == 0)
            throw new ArgumentException("A craft_conformance check requires at least one rule.", nameof(rules));
    }

    public override AssertionResult Evaluate(AgentRunResult runResult, WorkspaceView workspaceView)
    {
        ArgumentNullException.ThrowIfNull(workspaceView);
        var description = new AssertionDescription("craft conformance holds");

        foreach (var rule in _rules)
        {
            if (!rule.Evaluate(runResult, workspaceView).IsPass())
                return new AssertionFailed(description, new FailureReason("a craft rule is violated"));
        }

        return new AssertionPassed(description);
    }

    internal override bool ChecksWorkspace => true;

    internal override void DeclareProbes(WorkspaceProbeRequests sink)
    {
        ArgumentNullException.ThrowIfNull(sink);
        foreach (var rule in _rules)
            rule.DeclareProbes(sink);
    }
}
