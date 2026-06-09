namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// First-class collection of <see cref="ToolName"/> — the tools the
/// agent invoked during a single run. Empty is allowed (some runs use
/// no tools).
/// </summary>
public sealed class ToolInvocations
{
    private readonly IReadOnlyList<ToolName> _items;

    public ToolInvocations(IReadOnlyList<ToolName> items)
    {
        _items = items ?? throw new ArgumentNullException(nameof(items));
    }

    public static ToolInvocations None() => new(Array.Empty<ToolName>());

    internal bool Includes(ToolName tool)
    {
        foreach (var item in _items)
            if (item.Equals(tool))
                return true;
        return false;
    }
}
