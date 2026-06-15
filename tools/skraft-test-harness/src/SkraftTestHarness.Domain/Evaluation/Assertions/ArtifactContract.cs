namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Proves an artefact produced by phase N is consumable by phase N+1
/// without chaining the real run (mode H2). Aggregates the file
/// requirements the downstream <see cref="Consumer"/> expects in its
/// input; passes only when every requirement holds against the produced
/// workspace. Each requirement is an existing file assertion
/// (<see cref="FileMatchesGlob"/> for a glob-only requirement,
/// <see cref="FileContains"/> when required text is given), so this is a
/// composition — not a new evaluation engine.
/// </summary>
public sealed class ArtifactContract : Assertion
{
    private readonly Consumer _consumer;
    private readonly IReadOnlyList<Assertion> _requirements;

    public ArtifactContract(Consumer consumer, IReadOnlyList<Assertion> requirements)
    {
        _consumer = consumer ?? throw new ArgumentNullException(nameof(consumer));
        _requirements = requirements ?? throw new ArgumentNullException(nameof(requirements));
        if (_requirements.Count == 0)
            throw new ArgumentException("An artifact_contract requires at least one requirement.", nameof(requirements));
    }

    public override AssertionResult Evaluate(AgentRunResult runResult, WorkspaceView workspaceView)
    {
        ArgumentNullException.ThrowIfNull(workspaceView);
        var description = new AssertionDescription($"artifact is consumable by \"{_consumer}\"");

        foreach (var requirement in _requirements)
        {
            if (!requirement.Evaluate(runResult, workspaceView).IsPass())
            {
                return new AssertionFailed(
                    description,
                    new FailureReason($"artifact does not satisfy the input contract of '{_consumer}'"));
            }
        }

        return new AssertionPassed(description);
    }

    internal override bool ChecksWorkspace => true;

    internal override void DeclareProbes(WorkspaceProbeRequests sink)
    {
        ArgumentNullException.ThrowIfNull(sink);
        foreach (var requirement in _requirements)
            requirement.DeclareProbes(sink);
    }
}
