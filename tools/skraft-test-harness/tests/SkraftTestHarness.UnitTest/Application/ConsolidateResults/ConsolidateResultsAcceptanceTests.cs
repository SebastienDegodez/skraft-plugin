using SkraftTestHarness.Application.ConsolidateResults;
using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Domain.Skills;

namespace SkraftTestHarness.UnitTest.Application.ConsolidateResults;

/// <summary>
/// Outer-loop acceptance tests for <c>ConsolidateResults</c>. The
/// handler aggregates N <see cref="SkillVerdict"/>s into a single
/// <see cref="AggregateReport"/> answering "how many scenarios were won
/// overall by With-Skill vs Baseline vs Tie?" plus a per-skill
/// breakdown. Probes are Tell-Don't-Ask only (Object Calisthenics rule
/// 9 — no getters).
/// </summary>
public sealed class ConsolidateResultsAcceptanceTests
{
    [Test]
    public async Task ShouldAggregateScenarioCountsAcrossSkillVerdicts()
    {
        var skillA = new SkillReference("A");
        var skillB = new SkillReference("B");

        var verdictA = BuildSkillVerdict(skillA,
            (name: "A1", winner: Winner.WithSkill),
            (name: "A2", winner: Winner.WithSkill));

        var verdictB = BuildSkillVerdict(skillB,
            (name: "B1", winner: Winner.WithSkill),
            (name: "B2", winner: Winner.Baseline),
            (name: "B3", winner: Winner.Tie));

        var handler = new ConsolidateResultsHandler();

        var report = await handler.Handle(
            new ConsolidateResultsCommand(new[] { verdictA, verdictB }),
            CancellationToken.None);

        await Assert.That(report.HasWonScenarios(Winner.WithSkill, count: 3)).IsTrue();
        await Assert.That(report.HasWonScenarios(Winner.Baseline, count: 1)).IsTrue();
        await Assert.That(report.HasWonScenarios(Winner.Tie, count: 1)).IsTrue();
        await Assert.That(report.HasTotalScenarios(5)).IsTrue();
        await Assert.That(report.IncludesSkill(skillA)).IsTrue();
        await Assert.That(report.IncludesSkill(skillB)).IsTrue();
    }

    [Test]
    public async Task ShouldRejectAnEmptyVerdictSet()
    {
        var handler = new ConsolidateResultsHandler();

        await Assert.That(async () => await handler.Handle(
                new ConsolidateResultsCommand(Array.Empty<SkillVerdict>()),
                CancellationToken.None))
            .Throws<ArgumentException>();
    }

    private static SkillVerdict BuildSkillVerdict(
        SkillReference skill,
        params (string name, Winner winner)[] scenarios)
    {
        var verdicts = scenarios
            .Select(s => BuildScenarioVerdict(s.name, s.winner))
            .ToArray();
        return new SkillVerdict(skill, new ScenarioVerdicts(verdicts));
    }

    private static ScenarioVerdict BuildScenarioVerdict(string name, Winner winner)
    {
        var scenario = Scenario.Create(
            name: name,
            prompt: "stub prompt",
            assertions: new Assertion[] { new OutputContains(new Needle("stub")) });

        var output = new AgentOutput("stub-output");
        var outcome = new ScenarioOutcome(output, new AssertionResults(Array.Empty<AssertionResult>()));
        var run = new EvaluationRun(RunMode.Baseline, outcome);
        var runs = new EvaluationRuns(new[] { run });
        var decision = new JudgeDecision(winner, new JudgeReason("stub"));
        var judgedRuns = new JudgedRuns(runs, decision);
        return new ScenarioVerdict(scenario, judgedRuns);
    }
}
