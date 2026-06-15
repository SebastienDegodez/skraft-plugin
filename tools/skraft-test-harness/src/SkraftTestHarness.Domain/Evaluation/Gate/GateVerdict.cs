namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// First-class collection of <see cref="GateScenarioVerdict"/>, one per
/// scenario run through the gate. The gate as a whole holds only when
/// every scenario passes — there is no notion of an adversary.
/// </summary>
public sealed class GateVerdict
{
    private readonly IReadOnlyList<GateScenarioVerdict> _items;

    public GateVerdict(IReadOnlyList<GateScenarioVerdict> items)
    {
        _items = items ?? throw new ArgumentNullException(nameof(items));
        if (_items.Count == 0)
        {
            throw new ArgumentException("A gate verdict requires at least one scenario verdict.", nameof(items));
        }
    }

    public bool IsPass() => _items.All(v => v.IsPass());

    public int Count() => _items.Count;

    /// <summary>Hands each scenario's name and PASS/FAIL status to the callback (Tell-Don't-Ask).</summary>
    public void RenderEach(Action<string, string> onScenarioStatus)
    {
        ArgumentNullException.ThrowIfNull(onScenarioStatus);
        foreach (var item in _items)
            item.RenderTo(onScenarioStatus);
    }
}
