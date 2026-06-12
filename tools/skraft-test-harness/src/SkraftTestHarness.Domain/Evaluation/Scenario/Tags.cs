namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// First-class collection of the category tags a scenario declares
/// (phase: discover…deliver; kind: smoke / simulation / judge; …).
/// Matching is case-insensitive.
/// </summary>
public sealed class Tags
{
    private readonly IReadOnlySet<string> _values;

    public Tags(IEnumerable<string> values)
    {
        ArgumentNullException.ThrowIfNull(values);
        _values = values
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Select(v => v.Trim())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    public static Tags None() => new([]);

    internal bool ContainsAll(IReadOnlyCollection<string> requested)
        => requested.All(_values.Contains);
}
