namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>Non-empty workspace-relative file path used by <see cref="FileExists"/>.</summary>
public sealed class FilePath : StringValueObject
{
    public FilePath(string value) : base(value, nameof(value)) { }
}
