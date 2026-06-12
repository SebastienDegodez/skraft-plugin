namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// LLM-backed assertion: passes when the judge confirms that the
/// agent's final output satisfies the <see cref="Criterion"/>. Last
/// resort — prefer code assertions or <see cref="FileJudge"/>.
/// An unresolved judgement is always a failure — never a silent pass.
/// </summary>
public sealed class OutputJudge : Assertion
{
    private readonly Criterion _criterion;

    public OutputJudge(Criterion criterion)
    {
        _criterion = criterion ?? throw new ArgumentNullException(nameof(criterion));
    }

    public override AssertionResult Evaluate(AgentRunResult runResult, WorkspaceView workspaceView)
    {
        ArgumentNullException.ThrowIfNull(workspaceView);
        var description = new AssertionDescription($"agent output satisfies: {_criterion}");
        if (workspaceView.OutputJudgedSatisfactory(_criterion))
            return new AssertionPassed(description);
        return new AssertionFailed(
            description,
            new FailureReason($"judge did not confirm '{_criterion}' for the agent output"));
    }

    internal override void DeclareProbes(WorkspaceProbeRequests sink)
    {
        ArgumentNullException.ThrowIfNull(sink);
        sink.DeclareOutputJudgement(_criterion);
    }
}
