namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Mutable sink collecting the workspace probes declared by a
/// scenario's assertions (Tell-Don't-Ask: each <see cref="Assertion"/>
/// pushes what it needs). Application resolves the requests against
/// the real filesystem and gets back an immutable
/// <see cref="WorkspaceView"/> snapshot, so Domain evaluation stays
/// IO-free.
/// </summary>
public sealed class WorkspaceProbeRequests
{
    private readonly List<FilePath> _files = [];
    private readonly List<GlobPattern> _globs = [];
    private readonly List<(GlobPattern Pattern, Needle Needle)> _contents = [];

    public void DeclareFile(FilePath path)
        => _files.Add(path ?? throw new ArgumentNullException(nameof(path)));

    public void DeclareGlob(GlobPattern pattern)
        => _globs.Add(pattern ?? throw new ArgumentNullException(nameof(pattern)));

    public void DeclareContent(GlobPattern pattern, Needle needle)
    {
        ArgumentNullException.ThrowIfNull(pattern);
        ArgumentNullException.ThrowIfNull(needle);
        _contents.Add((pattern, needle));
    }

    public WorkspaceView ResolveWith(
        Func<FilePath, bool> fileExists,
        Func<GlobPattern, bool> anyGlobMatches,
        Func<GlobPattern, Needle, bool> anyMatchContains)
    {
        ArgumentNullException.ThrowIfNull(fileExists);
        ArgumentNullException.ThrowIfNull(anyGlobMatches);
        ArgumentNullException.ThrowIfNull(anyMatchContains);

        var files = new Dictionary<FilePath, bool>();
        foreach (var path in _files)
            files[path] = fileExists(path);

        var globs = new Dictionary<GlobPattern, bool>();
        foreach (var pattern in _globs)
            globs[pattern] = anyGlobMatches(pattern);

        var contents = new Dictionary<(GlobPattern, Needle), bool>();
        foreach (var (pattern, needle) in _contents)
            contents[(pattern, needle)] = anyMatchContains(pattern, needle);

        return new WorkspaceView(files, globs, contents);
    }
}
