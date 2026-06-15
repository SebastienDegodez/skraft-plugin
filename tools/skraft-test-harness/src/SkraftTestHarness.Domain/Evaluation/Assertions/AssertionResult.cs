namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Result of evaluating a single <see cref="Assertion"/> against an
/// <see cref="AgentOutput"/> — either <see cref="AssertionPassed"/> or
/// <see cref="AssertionFailed"/>.
/// </summary>
public abstract class AssertionResult
{
    private readonly AssertionDescription _description;

    protected AssertionResult(AssertionDescription description)
    {
        _description = description ?? throw new ArgumentNullException(nameof(description));
    }

    internal abstract bool IsPass();

    public override string ToString() => _description.ToString();
}
