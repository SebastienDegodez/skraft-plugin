using System.Text.RegularExpressions;

namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Non-empty, pre-compiled regex pattern. Wraps both the raw pattern
/// (for description) and its compiled form (for matching) behind a
/// single behavioural surface.
/// </summary>
public sealed class RegexPattern : StringValueObject
{
    private readonly Regex _compiled;

    public RegexPattern(string value) : base(value, nameof(value))
    {
        _compiled = new Regex(value, RegexOptions.CultureInvariant);
    }

    internal bool IsMatchIn(string haystack) => _compiled.IsMatch(haystack);
}
