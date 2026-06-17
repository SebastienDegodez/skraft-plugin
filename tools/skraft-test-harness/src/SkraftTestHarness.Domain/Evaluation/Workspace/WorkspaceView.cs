namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Immutable snapshot of workspace probe results, built by resolving a
/// <see cref="WorkspaceProbeRequests"/> before evaluation so Domain
/// assertions (<see cref="FileExists"/>, <see cref="FileMatchesGlob"/>,
/// <see cref="FileContains"/>) can decide without reaching out to any
/// gateway.
/// </summary>
public sealed class WorkspaceView
{
    private readonly IReadOnlyDictionary<FilePath, bool> _files;
    private readonly IReadOnlyDictionary<GlobPattern, bool> _globMatches;
    private readonly IReadOnlyDictionary<(GlobPattern, Needle), bool> _contentMatches;
    private readonly IReadOnlyDictionary<(GlobPattern, Criterion), bool> _fileJudgements;
    private readonly IReadOnlyDictionary<Criterion, bool> _outputJudgements;
    private readonly IReadOnlyDictionary<GlobPattern, IReadOnlyList<string>> _matchedContents;

    internal WorkspaceView(
        IReadOnlyDictionary<FilePath, bool> files,
        IReadOnlyDictionary<GlobPattern, bool> globMatches,
        IReadOnlyDictionary<(GlobPattern, Needle), bool> contentMatches,
        IReadOnlyDictionary<(GlobPattern, Criterion), bool> fileJudgements,
        IReadOnlyDictionary<Criterion, bool> outputJudgements)
        : this(files, globMatches, contentMatches, fileJudgements, outputJudgements,
            new Dictionary<GlobPattern, IReadOnlyList<string>>())
    {
    }

    internal WorkspaceView(
        IReadOnlyDictionary<FilePath, bool> files,
        IReadOnlyDictionary<GlobPattern, bool> globMatches,
        IReadOnlyDictionary<(GlobPattern, Needle), bool> contentMatches,
        IReadOnlyDictionary<(GlobPattern, Criterion), bool> fileJudgements,
        IReadOnlyDictionary<Criterion, bool> outputJudgements,
        IReadOnlyDictionary<GlobPattern, IReadOnlyList<string>> matchedContents)
    {
        _files = files ?? throw new ArgumentNullException(nameof(files));
        _globMatches = globMatches ?? throw new ArgumentNullException(nameof(globMatches));
        _contentMatches = contentMatches ?? throw new ArgumentNullException(nameof(contentMatches));
        _fileJudgements = fileJudgements ?? throw new ArgumentNullException(nameof(fileJudgements));
        _outputJudgements = outputJudgements ?? throw new ArgumentNullException(nameof(outputJudgements));
        _matchedContents = matchedContents ?? throw new ArgumentNullException(nameof(matchedContents));
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

    /// <summary>
    /// True when at least one file matching <paramref name="pattern"/>
    /// has content satisfying <paramref name="predicate"/>. Lets craft
    /// rules apply pure predicates (regex, JSON parsing) over the
    /// produced files without the Domain touching the filesystem.
    /// </summary>
    internal bool AnyMatchedContent(GlobPattern pattern, Func<string, bool> predicate)
    {
        ArgumentNullException.ThrowIfNull(pattern);
        ArgumentNullException.ThrowIfNull(predicate);
        return _matchedContents.TryGetValue(pattern, out var contents)
            && contents.Any(predicate);
    }
}
