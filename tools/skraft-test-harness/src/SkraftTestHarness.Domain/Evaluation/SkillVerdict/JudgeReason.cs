namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>Explanation given by the pairwise judge.</summary>
public sealed class JudgeReason : StringValueObject
{
    public JudgeReason(string value) : base(value, nameof(value)) { }
}
