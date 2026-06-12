namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Passes when at least one workspace file matching the configured
/// <see cref="GlobPattern"/> contains the <see cref="Needle"/> text.
/// Used to verify reviewer verdict contents (e.g. a
/// <c>deliver-review-*.md</c> containing <c>Verdict: APPROVED</c>).
/// </summary>
public sealed class FileContains : Assertion
{
    private readonly GlobPattern _pattern;
    private readonly Needle _needle;

    public FileContains(GlobPattern pattern, Needle needle)
    {
        _pattern = pattern ?? throw new ArgumentNullException(nameof(pattern));
        _needle = needle ?? throw new ArgumentNullException(nameof(needle));
    }

    public override AssertionResult Evaluate(AgentRunResult runResult, WorkspaceView workspaceView)
    {
        ArgumentNullException.ThrowIfNull(workspaceView);
        var description = new AssertionDescription(
            $"some file matching \"{_pattern}\" contains \"{_needle}\"");
        if (workspaceView.ContentFound(_pattern, _needle))
            return new AssertionPassed(description);
        return new AssertionFailed(
            description,
            new FailureReason($"no file matching '{_pattern}' contains '{_needle}'"));
    }

    internal override void DeclareProbes(WorkspaceProbeRequests sink)
    {
        ArgumentNullException.ThrowIfNull(sink);
        sink.DeclareContent(_pattern, _needle);
    }
}
