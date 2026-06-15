namespace SkraftTestHarness.Domain.Evaluation;

public sealed class AssertionFailed : AssertionResult
{
    private readonly FailureReason _reason;

    public AssertionFailed(AssertionDescription description, FailureReason reason) : base(description)
    {
        _reason = reason ?? throw new ArgumentNullException(nameof(reason));
    }

    internal override bool IsPass() => false;

    public override string ToString() => $"{base.ToString()}: {_reason}";
}
