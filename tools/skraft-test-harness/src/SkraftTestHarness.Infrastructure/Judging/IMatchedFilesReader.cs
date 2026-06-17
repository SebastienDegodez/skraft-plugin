using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Infrastructure.Judging;

/// <summary>
/// Reads the contents of workspace files matching a glob, on behalf of
/// the LLM file_judge. Implemented by
/// <see cref="Workspace.FileSystemWorkspaceProbe"/>; fakes in tests.
/// </summary>
public interface IMatchedFilesReader
{
    IReadOnlyDictionary<string, string> ReadMatching(GlobPattern pattern);
}
