using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.UnitTest.Domain.Evaluation;

/// <summary>
/// RED: Domain tests for the LLM-backed assertions
/// (<see cref="FileJudge"/>, <see cref="OutputJudge"/>). Like the
/// workspace probes, judgements are declared by the assertions and
/// resolved by Application through a gateway — Domain only consumes
/// the resolved snapshot, so it stays IO-free and LLM-free.
/// </summary>
public sealed class JudgeAssertionsTests
{
    private static readonly AgentRunResult AnyRunResult =
        AgentRunResult.OutputOnly(new AgentOutput("irrelevant output"));

    [Test]
    public async Task FileJudge_ShouldPass_WhenTheJudgeAcceptsTheMatchedFiles()
    {
        var scenario = Scenario.Create(
            name: "ADR quality",
            prompt: "Design the feature.",
            assertions:
            [
                new FileJudge(
                    new GlobPattern("adrs/adr-*.md"),
                    new Criterion("the ADR lists at least two alternatives and justifies the decision")),
            ]);

        var view = await scenario.CollectProbeRequests().ResolveWith(
            fileExists: _ => false,
            anyGlobMatches: _ => false,
            anyMatchContains: (_, _) => false,
            judgeFiles: (_, _) => Task.FromResult(true),
            judgeOutput: _ => Task.FromResult(false));

        var outcome = scenario.EvaluateAgainst(AnyRunResult, view);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsTrue();
    }

    [Test]
    public async Task FileJudge_ShouldFail_WhenTheJudgeRejectsTheMatchedFiles()
    {
        var scenario = Scenario.Create(
            name: "ADR quality",
            prompt: "Design the feature.",
            assertions:
            [
                new FileJudge(
                    new GlobPattern("adrs/adr-*.md"),
                    new Criterion("the ADR lists at least two alternatives")),
            ]);

        var view = await scenario.CollectProbeRequests().ResolveWith(
            fileExists: _ => false,
            anyGlobMatches: _ => false,
            anyMatchContains: (_, _) => false,
            judgeFiles: (_, _) => Task.FromResult(false),
            judgeOutput: _ => Task.FromResult(false));

        var outcome = scenario.EvaluateAgainst(AnyRunResult, view);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsFalse();
    }

    [Test]
    public async Task OutputJudge_ShouldPass_WhenTheJudgeAcceptsTheAgentOutput()
    {
        var scenario = Scenario.Create(
            name: "Business language",
            prompt: "Explain the plan.",
            assertions: [new OutputJudge(new Criterion("the answer uses business vocabulary only"))]);

        var view = await scenario.CollectProbeRequests().ResolveWith(
            fileExists: _ => false,
            anyGlobMatches: _ => false,
            anyMatchContains: (_, _) => false,
            judgeFiles: (_, _) => Task.FromResult(false),
            judgeOutput: _ => Task.FromResult(true));

        var outcome = scenario.EvaluateAgainst(AnyRunResult, view);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsTrue();
    }

    [Test]
    public async Task ResolveWith_ShouldHandEachDeclaredJudgementToItsResolver()
    {
        var judgedFiles = new List<string>();
        var judgedOutputs = new List<string>();

        var scenario = Scenario.Create(
            name: "All judgement kinds",
            prompt: "Run.",
            assertions:
            [
                new FileJudge(new GlobPattern("features/*.feature"), new Criterion("business language")),
                new OutputJudge(new Criterion("cites the iron rule")),
            ]);

        _ = await scenario.CollectProbeRequests().ResolveWith(
            fileExists: _ => false,
            anyGlobMatches: _ => false,
            anyMatchContains: (_, _) => false,
            judgeFiles: (glob, criterion) =>
            {
                judgedFiles.Add($"{glob}|{criterion}");
                return Task.FromResult(true);
            },
            judgeOutput: criterion =>
            {
                judgedOutputs.Add(criterion.ToString());
                return Task.FromResult(true);
            });

        await Assert.That(judgedFiles).Contains("features/*.feature|business language");
        await Assert.That(judgedOutputs).Contains("cites the iron rule");
    }

    [Test]
    public async Task SyncResolveWith_ShouldFailDeclaredJudgements_NotResolveThem()
    {
        var scenario = Scenario.Create(
            name: "Sync path",
            prompt: "Run.",
            assertions: [new OutputJudge(new Criterion("anything"))]);

        var view = scenario.CollectProbeRequests().ResolveWith(
            fileExists: _ => true,
            anyGlobMatches: _ => true,
            anyMatchContains: (_, _) => true);

        var outcome = scenario.EvaluateAgainst(AnyRunResult, view);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsFalse();
    }
}
