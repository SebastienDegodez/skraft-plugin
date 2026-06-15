namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>Non-empty search term used by <see cref="OutputContains"/>.</summary>
public sealed class Needle : StringValueObject
{
    public Needle(string value) : base(value, nameof(value)) { }

    internal bool IsFoundIn(string haystack)
        => haystack.Contains(ToString(), StringComparison.OrdinalIgnoreCase);
}
