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
}
