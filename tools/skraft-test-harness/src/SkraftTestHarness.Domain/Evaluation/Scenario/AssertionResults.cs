namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// First-class collection of <see cref="AssertionResult"/> — owns the
/// aggregated pass decision (Tell-Don't-Ask).
/// </summary>
public sealed class AssertionResults
{
    private readonly IReadOnlyList<AssertionResult> _items;

    public AssertionResults(IReadOnlyList<AssertionResult> items)
    {
        _items = items ?? throw new ArgumentNullException(nameof(items));
    }

    public bool AreAllPassing() => _items.All(r => r.IsPass());

    public int PassCount() => _items.Count(r => r.IsPass());

    public int Count() => _items.Count;

    /// <summary>Hands every failing assertion's description to the callback (Tell-Don't-Ask).</summary>
    public void WithFailures(Action<string> use)
    {
        ArgumentNullException.ThrowIfNull(use);
        foreach (var result in _items.Where(r => !r.IsPass()))
            use(result.ToString());
    }
}
