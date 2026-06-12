namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Declarative workspace a scenario must run in: a named fixture
/// (e.g. <c>clean-architecture-app</c>) optionally advanced to a named
/// checkpoint (e.g. <c>after-discover</c>). Domain only carries the
/// declaration — Infrastructure resolves and clones the directory.
/// <see cref="None"/> means the scenario needs no provisioned workspace.
/// </summary>
public sealed class WorkspaceRequirement
{
    private readonly string? _fixture;
    private readonly string? _checkpoint;

    private WorkspaceRequirement(string? fixture, string? checkpoint)
    {
        _fixture = fixture;
        _checkpoint = checkpoint;
    }

    public static WorkspaceRequirement None() => new(null, null);

    public static WorkspaceRequirement FromFixture(string fixture, string? checkpoint)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(fixture);
        return new WorkspaceRequirement(fixture, checkpoint);
    }

    /// <summary>Invokes <paramref name="use"/> only when a workspace is declared.</summary>
    public void WithSource(Action<string, string?> use)
    {
        ArgumentNullException.ThrowIfNull(use);
        if (_fixture is not null)
            use(_fixture, _checkpoint);
    }
}
