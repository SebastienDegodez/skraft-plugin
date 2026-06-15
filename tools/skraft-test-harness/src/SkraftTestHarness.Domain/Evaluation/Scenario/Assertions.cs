namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// The assertions a scenario declares — enforces the scenario invariant
/// (≥1 assertion) and owns evaluating them, so <see cref="Scenario"/>
/// delegates here instead of looping externally.
/// </summary>
public sealed class Assertions
{
    private readonly IReadOnlyList<Assertion> _items;

    public Assertions(IReadOnlyList<Assertion> items)
    {
        if (items is null)
            throw new ArgumentNullException(nameof(items));
        if (items.Count == 0)
            throw new ArgumentException("A scenario must declare at least one assertion.", nameof(items));

        _items = items;
    }

    public AssertionResults EvaluateAgainst(AgentRunResult runResult, WorkspaceView workspaceView)
    {
        ArgumentNullException.ThrowIfNull(workspaceView);
        var results = new List<AssertionResult>(_items.Count);
        foreach (var assertion in _items)
            results.Add(assertion.Evaluate(runResult, workspaceView));
        return new AssertionResults(results);
    }

    internal WorkspaceProbeRequests CollectProbeRequests()
    {
        var sink = new WorkspaceProbeRequests();
        foreach (var assertion in _items)
            assertion.DeclareProbes(sink);
        return sink;
    }

    /// <summary>
    /// Evaluates only the workspace-checking assertions (file
    /// presence/content) — used by <c>verify-checkpoint</c> where no
    /// agent ran and output/judge assertions are meaningless.
    /// </summary>
    internal AssertionResults VerifyWorkspace(WorkspaceView workspaceView)
    {
        ArgumentNullException.ThrowIfNull(workspaceView);
        var neutralRun = AgentRunResult.OutputOnly(new AgentOutput(string.Empty));
        var results = _items
            .Where(a => a.ChecksWorkspace)
            .Select(a => a.Evaluate(neutralRun, workspaceView))
            .ToList();
        return new AssertionResults(results);
    }
}
