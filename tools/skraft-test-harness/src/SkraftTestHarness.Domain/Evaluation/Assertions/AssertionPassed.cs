namespace SkraftTestHarness.Domain.Evaluation;

public sealed class AssertionPassed : AssertionResult
{
    public AssertionPassed(AssertionDescription description) : base(description) { }

    internal override bool IsPass() => true;
}
