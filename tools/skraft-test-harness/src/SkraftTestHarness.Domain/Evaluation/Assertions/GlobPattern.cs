namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Non-empty workspace-relative glob pattern (e.g.
/// <c>reviews/**/deliver-review-*.md</c>) used by the workspace-aware
/// assertions <see cref="FileMatchesGlob"/> and <see cref="FileContains"/>.
/// </summary>
public sealed class GlobPattern : StringValueObject
{
    public GlobPattern(string value) : base(value, nameof(value)) { }
}
