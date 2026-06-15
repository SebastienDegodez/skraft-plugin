namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Absolute PASS/FAIL verdict for a single gate run — derived from
/// whether every assertion passed. Unlike <see cref="Winner"/> it carries
/// no notion of an adversary: a gate either holds or it does not.
/// </summary>
public sealed class GateOutcome
{
    private readonly bool _passed;

    private GateOutcome(bool passed) => _passed = passed;

    public static GateOutcome From(ScenarioOutcome outcome)
    {
        ArgumentNullException.ThrowIfNull(outcome);
        return new GateOutcome(outcome.AreAllAssertionsPassing());
    }

    public bool IsPass() => _passed;

    /// <summary>Hands the textual status (PASS/FAIL) to the callback (Tell-Don't-Ask).</summary>
    public void WithStatus(Action<string> use)
    {
        ArgumentNullException.ThrowIfNull(use);
        use(_passed ? "PASS" : "FAIL");
    }
}
