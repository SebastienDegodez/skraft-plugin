namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>Explanation of why an assertion failed.</summary>
public sealed class FailureReason : StringValueObject
{
    public FailureReason(string value) : base(value, nameof(value)) { }
}
