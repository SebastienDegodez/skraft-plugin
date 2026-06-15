namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Declarative workspace a scenario must run in, resolved as up to three
/// overlay layers (Infrastructure clones and overlays them in order):
/// <list type="number">
///   <item><c>fixture</c> — the base app (e.g. <c>clean-architecture-app</c>), required.</item>
///   <item><c>baseline</c> — optional CODE of a previously-delivered story this one
///   extends (e.g. <c>promotion-stacking/baseline</c>); committed once, never per phase.</item>
///   <item><c>checkpoint</c> — optional planning state of the prior phases
///   (e.g. <c>promotion-stacking/after-discover</c>, <c>.copilot-tracking</c> only).</item>
/// </list>
/// Later layers win on path conflict. <see cref="None"/> means no provisioned workspace.
/// </summary>
public sealed class WorkspaceRequirement
{
    private readonly string? _fixture;
    private readonly string? _baseline;
    private readonly string? _checkpoint;

    private WorkspaceRequirement(string? fixture, string? baseline, string? checkpoint)
    {
        _fixture = fixture;
        _baseline = baseline;
        _checkpoint = checkpoint;
    }

    public static WorkspaceRequirement None() => new(null, null, null);

    public static WorkspaceRequirement FromFixture(string fixture, string? checkpoint)
        => FromFixture(fixture, baseline: null, checkpoint);

    public static WorkspaceRequirement FromFixture(string fixture, string? baseline, string? checkpoint)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(fixture);
        return new WorkspaceRequirement(fixture, baseline, checkpoint);
    }

    /// <summary>Invokes <paramref name="use"/> only when a workspace is declared.</summary>
    public void WithSource(Action<string, string?, string?> use)
    {
        ArgumentNullException.ThrowIfNull(use);
        if (_fixture is not null)
            use(_fixture, _baseline, _checkpoint);
    }
}
