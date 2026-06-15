namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Passes when at least one workspace file matching the
/// <see cref="GlobPattern"/> has content matching the
/// <see cref="RegexPattern"/>. Backs craft rules that inspect code shape
/// (e.g. an Infrastructure class implementing a <c>*Gateway</c> /
/// <c>*Repository</c> interface). Reads matched contents from the
/// pre-resolved <see cref="WorkspaceView"/> — the Domain never touches
/// the filesystem.
/// </summary>
public sealed class FileContentMatches : Assertion
{
    private readonly GlobPattern _pattern;
    private readonly RegexPattern _regex;

    public FileContentMatches(GlobPattern pattern, RegexPattern regex)
    {
        _pattern = pattern ?? throw new ArgumentNullException(nameof(pattern));
        _regex = regex ?? throw new ArgumentNullException(nameof(regex));
    }

    public override AssertionResult Evaluate(AgentRunResult runResult, WorkspaceView workspaceView)
    {
        ArgumentNullException.ThrowIfNull(workspaceView);
        var description = new AssertionDescription(
            $"some file matching \"{_pattern}\" has content matching /{_regex}/");
        if (workspaceView.AnyMatchedContent(_pattern, _regex.IsMatchIn))
            return new AssertionPassed(description);
        return new AssertionFailed(
            description,
            new FailureReason($"no file matching '{_pattern}' has content matching /{_regex}/"));
    }

    internal override bool ChecksWorkspace => true;

    internal override void DeclareProbes(WorkspaceProbeRequests sink)
    {
        ArgumentNullException.ThrowIfNull(sink);
        sink.DeclareMatchedContent(_pattern);
    }
}
