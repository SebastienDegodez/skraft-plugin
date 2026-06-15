namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>Human-readable description of an assertion.</summary>
public sealed class AssertionDescription : StringValueObject
{
    public AssertionDescription(string value) : base(value, nameof(value)) { }
}
