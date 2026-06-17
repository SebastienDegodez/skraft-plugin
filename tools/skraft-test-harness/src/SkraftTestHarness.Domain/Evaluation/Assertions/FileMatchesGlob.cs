namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Passes when at least one workspace file matches the configured
/// <see cref="GlobPattern"/>. Useful for dated/slugged artefact paths
/// (e.g. <c>.copilot-tracking/skraft-plans/*/reviews/*/deliver-review-*.md</c>)
/// whose exact name is unknown before the agent runs.
/// </summary>
public sealed class FileMatchesGlob : Assertion
{
    private readonly GlobPattern _pattern;

    public FileMatchesGlob(GlobPattern pattern)
    {
        _pattern = pattern ?? throw new ArgumentNullException(nameof(pattern));
    }

    public override AssertionResult Evaluate(AgentRunResult runResult, WorkspaceView workspaceView)
    {
        ArgumentNullException.ThrowIfNull(workspaceView);
        var description = new AssertionDescription($"some file matches \"{_pattern}\" in workspace");
        if (workspaceView.AnyMatches(_pattern))
            return new AssertionPassed(description);
        return new AssertionFailed(description, new FailureReason($"no file matches '{_pattern}'"));
    }

    internal override bool ChecksWorkspace => true;

    internal override void DeclareProbes(WorkspaceProbeRequests sink)
    {
        ArgumentNullException.ThrowIfNull(sink);
        sink.DeclareGlob(_pattern);
    }
}
