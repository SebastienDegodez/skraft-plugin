namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// A single identified architecture rule inside a
/// <see cref="CraftConformance"/> check. Wraps an inner
/// <see cref="Assertion"/> (the concrete verification) with a stable
/// <c>id</c> used in reporting. New rule kinds are introduced by handing
/// a different inner assertion — the rule itself never changes.
/// </summary>
public sealed class CraftRule
{
    private readonly string _id;
    private readonly Assertion _check;

    public CraftRule(string id, Assertion check)
    {
        if (string.IsNullOrWhiteSpace(id))
            throw new ArgumentException("A craft rule requires a non-empty id.", nameof(id));
        _id = id;
        _check = check ?? throw new ArgumentNullException(nameof(check));
    }

    internal AssertionResult Evaluate(AgentRunResult runResult, WorkspaceView workspaceView)
    {
        var description = new AssertionDescription($"craft rule \"{_id}\"");
        if (_check.Evaluate(runResult, workspaceView).IsPass())
            return new AssertionPassed(description);
        return new AssertionFailed(description, new FailureReason($"craft rule '{_id}' is violated"));
    }

    internal void DeclareProbes(WorkspaceProbeRequests sink)
    {
        ArgumentNullException.ThrowIfNull(sink);
        _check.DeclareProbes(sink);
    }
}
