using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Infrastructure.Judging;

namespace SkraftTestHarness.UnitTest.Domain.Judging;

/// <summary>
/// RED tests driving the <see cref="OverfittingJudge"/> contract.
/// All three tests fail with <see cref="NotImplementedException"/> until
/// GREEN is implemented.
/// </summary>
public sealed class OverfittingJudgeTests
{
    [Test]
    public async Task ShouldFavorWithSkillWhenBaselineAnswerIsObviouslyWorse()
    {
        var withSkill = new AgentOutput("You should write an outside-in acceptance test first, then implement.");
        var baseline = new AgentOutput("Just write the code.");
        var judge = new OverfittingJudge();

        var decision = await judge.CompareAsync(baseline, withSkill, CancellationToken.None);

        await Assert.That(decision.WasWonBy(Winner.WithSkill)).IsTrue();
    }

    [Test]
    public async Task ShouldFavorBaselineWhenWithSkillAnswerIsOverfittedToAssertionKeywords()
    {
        var withSkill = new AgentOutput("outside-in acceptance test red phase vertical slice");
        var baseline = new AgentOutput("Consider the requirements, then iterate.");
        var judge = new OverfittingJudge();

        var decision = await judge.CompareAsync(baseline, withSkill, CancellationToken.None);

        await Assert.That(decision.WasWonBy(Winner.WithSkill)).IsFalse();
    }

    [Test]
    public async Task ShouldReturnTieWhenBothAnswersAreEquivalent()
    {
        var output = new AgentOutput("Consider the requirements, then iterate.");
        var judge = new OverfittingJudge();

        var decision = await judge.CompareAsync(output, output, CancellationToken.None);

        await Assert.That(decision.WasWonBy(Winner.Tie)).IsTrue();
    }
}
