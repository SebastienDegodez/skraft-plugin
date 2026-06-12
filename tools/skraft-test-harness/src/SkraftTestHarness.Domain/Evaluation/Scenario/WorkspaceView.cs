namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Immutable snapshot of workspace probe results, built by resolving a
/// <see cref="WorkspaceProbeRequests"/> before evaluation so Domain
/// assertions (<see cref="FileExists"/>, <see cref="FileMatchesGlob"/>,
/// <see cref="FileContains"/>) can decide without reaching out to any
/// gateway. Exposes behaviour only, no getter.
/// </summary>
public sealed class WorkspaceView
{
    private readonly IReadOnlyDictionary<FilePath, bool> _files;
    private readonly IReadOnlyDictionary<GlobPattern, bool> _globMatches;
    private readonly IReadOnlyDictionary<(GlobPattern, Needle), bool> _contentMatches;
    private readonly IReadOnlyDictionary<(GlobPattern, Criterion), bool> _fileJudgements;
    private readonly IReadOnlyDictionary<Criterion, bool> _outputJudgements;

    internal WorkspaceView(
        IReadOnlyDictionary<FilePath, bool> files,
        IReadOnlyDictionary<GlobPattern, bool> globMatches,
        IReadOnlyDictionary<(GlobPattern, Needle), bool> contentMatches,
        IReadOnlyDictionary<(GlobPattern, Criterion), bool> fileJudgements,
        IReadOnlyDictionary<Criterion, bool> outputJudgements)
    {
        _files = files ?? throw new ArgumentNullException(nameof(files));
        _globMatches = globMatches ?? throw new ArgumentNullException(nameof(globMatches));
        _contentMatches = contentMatches ?? throw new ArgumentNullException(nameof(contentMatches));
        _fileJudgements = fileJudgements ?? throw new ArgumentNullException(nameof(fileJudgements));
        _outputJudgements = outputJudgements ?? throw new ArgumentNullException(nameof(outputJudgements));
    }

    public static WorkspaceView Empty() => new(
        new Dictionary<FilePath, bool>(),
        new Dictionary<GlobPattern, bool>(),
        new Dictionary<(GlobPattern, Needle), bool>(),
        new Dictionary<(GlobPattern, Criterion), bool>(),
        new Dictionary<Criterion, bool>());

    internal bool Exists(FilePath path)
    {
        ArgumentNullException.ThrowIfNull(path);
        return _files.TryGetValue(path, out var exists) && exists;
    }

    internal bool AnyMatches(GlobPattern pattern)
    {
        ArgumentNullException.ThrowIfNull(pattern);
        return _globMatches.TryGetValue(pattern, out var matched) && matched;
    }

    internal bool ContentFound(GlobPattern pattern, Needle needle)
    {
        ArgumentNullException.ThrowIfNull(pattern);
        ArgumentNullException.ThrowIfNull(needle);
        return _contentMatches.TryGetValue((pattern, needle), out var found) && found;
    }

    internal bool FilesJudgedSatisfactory(GlobPattern pattern, Criterion criterion)
    {
        ArgumentNullException.ThrowIfNull(pattern);
        ArgumentNullException.ThrowIfNull(criterion);
        return _fileJudgements.TryGetValue((pattern, criterion), out var passed) && passed;
    }

    internal bool OutputJudgedSatisfactory(Criterion criterion)
    {
        ArgumentNullException.ThrowIfNull(criterion);
        return _outputJudgements.TryGetValue(criterion, out var passed) && passed;
    }
}
