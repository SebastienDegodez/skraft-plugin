using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.UnitTest.Domain.Evaluation;

/// <summary>
/// Domain-level tests for <see cref="ImprovementScoreCalculator"/> and
/// the <see cref="ImprovementScore"/> value object. The calculator maps
/// each <see cref="Winner"/> in a <see cref="ScenarioVerdicts"/> to a
/// contribution (<c>+1</c>, <c>-1</c>, <c>0</c>) and returns the
/// arithmetic mean, clamped to <c>[-1, +1]</c> by the VO's constructor.
/// </summary>
public sealed class ImprovementScoreCalculatorTests
{
    [Test]
    public async Task SingleWithSkillWinnerScoresPlusOne()
    {
        var verdicts = VerdictsWith(Winner.WithSkill);

        var score = ImprovementScoreCalculator.For(verdicts);

        await Assert.That(score.IsApproximately(1.0, 0.0001)).IsTrue();
    }

    [Test]
    public async Task SingleBaselineWinnerScoresMinusOne()
    {
        var verdicts = VerdictsWith(Winner.Baseline);

        var score = ImprovementScoreCalculator.For(verdicts);

        await Assert.That(score.IsApproximately(-1.0, 0.0001)).IsTrue();
    }

    [Test]
    public async Task SingleTieScoresZero()
    {
        var verdicts = VerdictsWith(Winner.Tie);

        var score = ImprovementScoreCalculator.For(verdicts);

        await Assert.That(score.IsApproximately(0.0, 0.0001)).IsTrue();
    }

    [Test]
    public async Task MeanOfTwoWithSkillAndOneBaselineIsOneThird()
    {
        var verdicts = VerdictsWith(Winner.WithSkill, Winner.WithSkill, Winner.Baseline);

        var score = ImprovementScoreCalculator.For(verdicts);

        await Assert.That(score.IsApproximately(1.0 / 3.0, 0.0001)).IsTrue();
    }

    [Test]
    public async Task TwoTiesScoreZero()
    {
        var verdicts = VerdictsWith(Winner.Tie, Winner.Tie);

        var score = ImprovementScoreCalculator.For(verdicts);

        await Assert.That(score.IsApproximately(0.0, 0.0001)).IsTrue();
    }

    [Test]
    public async Task ScoreAboveOneIsRejectedAtConstruction()
    {
        await Assert.That(() => new ImprovementScore(1.5))
            .Throws<ArgumentOutOfRangeException>();
    }

    [Test]
    public async Task ScoreBelowMinusOneIsRejectedAtConstruction()
    {
        await Assert.That(() => new ImprovementScore(-1.5))
            .Throws<ArgumentOutOfRangeException>();
    }

    [Test]
    public async Task TwoScoresWithSameValueAreEqual()
    {
        var left = new ImprovementScore(0.5);
        var right = new ImprovementScore(0.5);

        await Assert.That(left.Equals(right)).IsTrue();
    }

    [Test]
    public async Task TwoScoresWithDifferentValuesAreNotEqual()
    {
        var left = new ImprovementScore(0.5);
        var right = new ImprovementScore(-0.5);

        await Assert.That(left.Equals(right)).IsFalse();
    }

    private static ScenarioVerdicts VerdictsWith(params Winner[] winners)
    {
        var items = new List<ScenarioVerdict>();
        for (var i = 0; i < winners.Length; i++)
        {
            var scenario = Scenario.Create(
                name: $"Scenario {i}",
                prompt: "p",
                assertions: [new OutputContains(new Needle("x"))]);

            var output = new AgentOutput("x");
            var runResult = AgentRunResult.OutputOnly(output);
            var baseline = new EvaluationRun(RunMode.Baseline, scenario.EvaluateAgainst(runResult));
            var isolated = new EvaluationRun(RunMode.Isolated, scenario.EvaluateAgainst(runResult));
            var runs = new EvaluationRuns(new[] { baseline, isolated });

            var decision = new JudgeDecision(winners[i], new JudgeReason("stub"));
            var judged = new JudgedRuns(runs, decision);
            items.Add(new ScenarioVerdict(scenario, judged));
        }
        return new ScenarioVerdicts(items);
    }
}
