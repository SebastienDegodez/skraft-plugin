namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Requested tag selection (comma-separated on the CLI). A scenario is
/// kept when it carries ALL requested tags; an empty filter keeps
/// everything.
/// </summary>
public sealed class TagFilter
{
    private readonly IReadOnlyCollection<string> _requested;

    private TagFilter(IReadOnlyCollection<string> requested)
    {
        _requested = requested;
    }

    public static TagFilter None() => new([]);

    public static TagFilter Parse(string? commaSeparated)
    {
        if (string.IsNullOrWhiteSpace(commaSeparated))
            return None();

        var requested = commaSeparated
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToList();
        return new TagFilter(requested);
    }

    internal bool Accepts(Tags tags)
    {
        ArgumentNullException.ThrowIfNull(tags);
        return _requested.Count == 0 || tags.ContainsAll(_requested);
    }
}
