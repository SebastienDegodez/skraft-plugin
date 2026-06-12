namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// LLM-backed assertion: passes when the judge confirms that the
/// workspace files matching the <see cref="GlobPattern"/> satisfy the
/// <see cref="Criterion"/>. Used only where code assertions cannot
/// verify the artefact (e.g. "the ADR justifies its alternatives").
/// An unresolved judgement is always a failure — never a silent pass.
/// </summary>
public sealed class FileJudge : Assertion
{
    private readonly GlobPattern _pattern;
    private readonly Criterion _criterion;

    public FileJudge(GlobPattern pattern, Criterion criterion)
    {
        _pattern = pattern ?? throw new ArgumentNullException(nameof(pattern));
        _criterion = criterion ?? throw new ArgumentNullException(nameof(criterion));
    }

    public override AssertionResult Evaluate(AgentRunResult runResult, WorkspaceView workspaceView)
    {
        ArgumentNullException.ThrowIfNull(workspaceView);
        var description = new AssertionDescription(
            $"files matching \"{_pattern}\" satisfy: {_criterion}");
        if (workspaceView.FilesJudgedSatisfactory(_pattern, _criterion))
            return new AssertionPassed(description);
        return new AssertionFailed(
            description,
            new FailureReason($"judge did not confirm '{_criterion}' for files matching '{_pattern}'"));
    }

    internal override void DeclareProbes(WorkspaceProbeRequests sink)
    {
        ArgumentNullException.ThrowIfNull(sink);
        sink.DeclareFileJudgement(_pattern, _criterion);
    }
}
