namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// The verdict for a whole gate run: one <see cref="GateScenarioVerdict"/>
/// per scenario. The gate as a whole holds only when every scenario
/// passes — there is no notion of an adversary.
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

    /// <summary>Provides each scenario's name, PASS/FAIL status and run telemetry to the caller.</summary>
    public void RenderEach(Action<string, string, RunTelemetry> onScenario)
    {
        ArgumentNullException.ThrowIfNull(onScenario);
        foreach (var item in _items)
            item.RenderTo(onScenario);
    }
}
