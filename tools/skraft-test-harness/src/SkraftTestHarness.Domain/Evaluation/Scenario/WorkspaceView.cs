namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Immutable snapshot of workspace probe results keyed by
/// <see cref="FilePath"/>. Built by Application before evaluation so
/// Domain assertions (<see cref="FileExists"/>) can decide without
/// reaching out to any gateway. First-class collection (Object
/// Calisthenics rule 4) — exposes behaviour only, no getter.
/// </summary>
public sealed class WorkspaceView
{
    private readonly IReadOnlyDictionary<FilePath, bool> _probed;

    public WorkspaceView(IReadOnlyDictionary<FilePath, bool> probed)
    {
        _probed = probed ?? throw new ArgumentNullException(nameof(probed));
    }

    public static WorkspaceView Empty() => new(new Dictionary<FilePath, bool>());

    internal bool Exists(FilePath path)
    {
        ArgumentNullException.ThrowIfNull(path);
        return _probed.TryGetValue(path, out var exists) && exists;
    }
}
