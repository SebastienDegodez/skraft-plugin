using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Application.Gateways;

/// <summary>
/// Output gateway : inspects the scenario workspace on behalf of
/// filesystem-aware assertions (<see cref="FileExists"/>,
/// <see cref="FileMatchesGlob"/>, <see cref="FileContains"/>).
/// Implementations live in Infrastructure
/// (<c>FileSystemWorkspaceProbe</c>, in-memory fake for tests).
/// </summary>
public interface IWorkspaceProbe
{
    bool Exists(FilePath path);

    bool AnyMatches(GlobPattern pattern);

    bool AnyMatchContains(GlobPattern pattern, Needle needle);
}
