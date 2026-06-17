using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.UnitTest.Domain.Gate;

/// <summary>
/// Unit tests for <see cref="GateOutcome"/> — the absolute PASS/FAIL
/// verdict derived from a single run's assertion results. No notion of
/// an adversary (unlike <see cref="Winner"/>).
/// </summary>
public sealed class GateOutcomeTests
{
    [Test]
    public async Task PassesWhenEveryAssertionPasses()
    {
        var outcome = new ScenarioOutcome(
            new AgentOutput("out"),
            new AssertionResults(new AssertionResult[]
            {
                new AssertionPassed(new AssertionDescription("a")),
            }));

        var gate = GateOutcome.From(outcome);

        await Assert.That(gate.IsPass()).IsTrue();
    }

    [Test]
    public async Task FailsWhenAnyAssertionFails()
    {
        var outcome = new ScenarioOutcome(
            new AgentOutput("out"),
            new AssertionResults(new AssertionResult[]
            {
                new AssertionPassed(new AssertionDescription("a")),
                new AssertionFailed(new AssertionDescription("b"), new FailureReason("nope")),
            }));

        var gate = GateOutcome.From(outcome);

        await Assert.That(gate.IsPass()).IsFalse();
    }
}
