namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Passes when the configured <see cref="FilePath"/> is present in the
/// scenario workspace. Domain stays IO-free: Application probes the
/// filesystem via <c>IWorkspaceProbe</c> before evaluation and hands
/// the resulting <see cref="WorkspaceView"/> snapshot to every
/// assertion.
/// </summary>
public sealed class FileExists : Assertion
{
    private readonly FilePath _path;

    public FileExists(FilePath path)
    {
        _path = path ?? throw new ArgumentNullException(nameof(path));
    }

    public override AssertionResult Evaluate(AgentRunResult runResult, WorkspaceView workspaceView)
    {
        ArgumentNullException.ThrowIfNull(workspaceView);
        var description = new AssertionDescription($"file \"{_path}\" exists in workspace");
        if (workspaceView.Exists(_path))
            return new AssertionPassed(description);
        return new AssertionFailed(description, new FailureReason($"file '{_path}' not found"));
    }

    internal override void CollectDeclaredFilePaths(List<FilePath> sink)
    {
        ArgumentNullException.ThrowIfNull(sink);
        sink.Add(_path);
    }
}
