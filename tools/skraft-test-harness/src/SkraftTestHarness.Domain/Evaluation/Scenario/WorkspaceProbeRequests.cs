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
    private readonly List<(GlobPattern Pattern, Criterion Criterion)> _fileJudgements = [];
    private readonly List<Criterion> _outputJudgements = [];

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

    public void DeclareFileJudgement(GlobPattern pattern, Criterion criterion)
    {
        ArgumentNullException.ThrowIfNull(pattern);
        ArgumentNullException.ThrowIfNull(criterion);
        _fileJudgements.Add((pattern, criterion));
    }

    public void DeclareOutputJudgement(Criterion criterion)
        => _outputJudgements.Add(criterion ?? throw new ArgumentNullException(nameof(criterion)));

    /// <summary>
    /// Synchronous resolution: workspace probes only. Declared LLM
    /// judgements are left unresolved, which evaluates as FAILED —
    /// an unjudged criterion must never pass silently.
    /// </summary>
    public WorkspaceView ResolveWith(
        Func<FilePath, bool> fileExists,
        Func<GlobPattern, bool> anyGlobMatches,
        Func<GlobPattern, Needle, bool> anyMatchContains)
    {
        ArgumentNullException.ThrowIfNull(fileExists);
        ArgumentNullException.ThrowIfNull(anyGlobMatches);
        ArgumentNullException.ThrowIfNull(anyMatchContains);

        return new WorkspaceView(
            ResolveFiles(fileExists),
            ResolveGlobs(anyGlobMatches),
            ResolveContents(anyMatchContains),
            new Dictionary<(GlobPattern, Criterion), bool>(),
            new Dictionary<Criterion, bool>());
    }

    /// <summary>
    /// Full resolution including LLM judgements (Application resolves
    /// them through the assertion-judge gateway).
    /// </summary>
    public async Task<WorkspaceView> ResolveWith(
        Func<FilePath, bool> fileExists,
        Func<GlobPattern, bool> anyGlobMatches,
        Func<GlobPattern, Needle, bool> anyMatchContains,
        Func<GlobPattern, Criterion, Task<bool>> judgeFiles,
        Func<Criterion, Task<bool>> judgeOutput)
    {
        ArgumentNullException.ThrowIfNull(fileExists);
        ArgumentNullException.ThrowIfNull(anyGlobMatches);
        ArgumentNullException.ThrowIfNull(anyMatchContains);
        ArgumentNullException.ThrowIfNull(judgeFiles);
        ArgumentNullException.ThrowIfNull(judgeOutput);

        var fileJudgements = new Dictionary<(GlobPattern, Criterion), bool>();
        foreach (var (pattern, criterion) in _fileJudgements)
            fileJudgements[(pattern, criterion)] = await judgeFiles(pattern, criterion).ConfigureAwait(false);

        var outputJudgements = new Dictionary<Criterion, bool>();
        foreach (var criterion in _outputJudgements)
            outputJudgements[criterion] = await judgeOutput(criterion).ConfigureAwait(false);

        return new WorkspaceView(
            ResolveFiles(fileExists),
            ResolveGlobs(anyGlobMatches),
            ResolveContents(anyMatchContains),
            fileJudgements,
            outputJudgements);
    }

    private Dictionary<FilePath, bool> ResolveFiles(Func<FilePath, bool> fileExists)
    {
        var files = new Dictionary<FilePath, bool>();
        foreach (var path in _files)
            files[path] = fileExists(path);
        return files;
    }

    private Dictionary<GlobPattern, bool> ResolveGlobs(Func<GlobPattern, bool> anyGlobMatches)
    {
        var globs = new Dictionary<GlobPattern, bool>();
        foreach (var pattern in _globs)
            globs[pattern] = anyGlobMatches(pattern);
        return globs;
    }

    private Dictionary<(GlobPattern, Needle), bool> ResolveContents(
        Func<GlobPattern, Needle, bool> anyMatchContains)
    {
        var contents = new Dictionary<(GlobPattern, Needle), bool>();
        foreach (var (pattern, needle) in _contents)
            contents[(pattern, needle)] = anyMatchContains(pattern, needle);
        return contents;
    }
}
