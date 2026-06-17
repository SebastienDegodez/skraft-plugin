using FakeItEasy;
using SkraftTestHarness.Application.EvaluateSkill;
using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Domain.Skills;

namespace SkraftTestHarness.UnitTest.Application.EvaluateSkill;

/// <summary>
/// Outer-loop acceptance tests for <c>EvaluateSkill</c>. The handler
/// runs every scenario twice (baseline + with the skill loaded in
/// isolation), asks the pairwise judge which output is better, and
/// aggregates per-scenario verdicts into a single
/// <see cref="SkillVerdict"/>. Probes rely on behaviour methods only
/// (Object Calisthenics rule 9).
/// </summary>
public sealed class EvaluateSkillAcceptanceTests
{
    private static readonly SkillReference TargetSkill = new("outside-in-tdd");

    private static readonly ScenarioName EchoName = new("Echo scenario");
    private static readonly ScenarioName GreetName = new("Greet scenario");

    private static readonly Scenario EchoScenario = Scenario.Create(
        name: "Echo scenario",
        prompt: "Say hi.",
        assertions: [new OutputContains(new Needle("hi"))]);

    private static readonly Scenario GreetScenario = Scenario.Create(
        name: "Greet scenario",
        prompt: "Greet the user.",
        assertions: [new OutputContains(new Needle("hello"))]);

    [Test]
    public async Task ShouldRunEachScenarioOnceAsBaselineAndOnceWithTheSkill()
    {
        var runner = A.Fake<IAgentRunner>();
        StubAnyRun(runner, "base", "skill");
        var judge = StubJudgeFavoring(Winner.WithSkill);
        var reporter = A.Fake<IReporter>();

        var handler = new EvaluateSkillHandler(runner, judge, reporter);

        _ = await handler.Handle(
            new EvaluateSkillCommand(TargetSkill, new Scenarios([EchoScenario, GreetScenario])),
            CancellationToken.None);

        A.CallTo(() => runner.RunAsync(EchoScenario, RunMode.Baseline, A<CancellationToken>._))
            .MustHaveHappenedOnceExactly();
        A.CallTo(() => runner.RunAsync(EchoScenario, RunMode.Isolated, A<CancellationToken>._))
            .MustHaveHappenedOnceExactly();
        A.CallTo(() => runner.RunAsync(GreetScenario, RunMode.Baseline, A<CancellationToken>._))
            .MustHaveHappenedOnceExactly();
        A.CallTo(() => runner.RunAsync(GreetScenario, RunMode.Isolated, A<CancellationToken>._))
            .MustHaveHappenedOnceExactly();
    }

    [Test]
    public async Task ShouldAskTheJudgeToComparePairwiseTheBaselineAndSkillOutputs()
    {
        var baselineOutput = new AgentOutput("baseline");
        var withSkillOutput = new AgentOutput("with-skill");
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, RunMode.Baseline, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(baselineOutput));
        A.CallTo(() => runner.RunAsync(A<Scenario>._, RunMode.Isolated, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(withSkillOutput));
        var judge = StubJudgeFavoring(Winner.Tie);
        var reporter = A.Fake<IReporter>();

        var handler = new EvaluateSkillHandler(runner, judge, reporter);

        _ = await handler.Handle(
            new EvaluateSkillCommand(TargetSkill, new Scenarios([EchoScenario])),
            CancellationToken.None);

        A.CallTo(() => judge.CompareAsync(baselineOutput, withSkillOutput, A<CancellationToken>._))
            .MustHaveHappenedOnceExactly();
    }

    [Test]
    public async Task ShouldProduceAVerdictCoveringEveryProvidedScenario()
    {
        var runner = A.Fake<IAgentRunner>();
        StubAnyRun(runner, "base", "skill");
        var judge = StubJudgeFavoring(Winner.WithSkill, reason: "skill clarifies intent");
        var reporter = A.Fake<IReporter>();

        var handler = new EvaluateSkillHandler(runner, judge, reporter);

        var verdict = await handler.Handle(
            new EvaluateSkillCommand(TargetSkill, new Scenarios([EchoScenario, GreetScenario])),
            CancellationToken.None);

        await Assert.That(verdict.IsFor(TargetSkill)).IsTrue();
        await Assert.That(verdict.CoversScenarioCount(2)).IsTrue();
        await Assert.That(verdict.CoversScenarioNamed(EchoName)).IsTrue();
        await Assert.That(verdict.CoversScenarioNamed(GreetName)).IsTrue();
        await Assert.That(verdict.WonByFor(EchoName, Winner.WithSkill)).IsTrue();
        await Assert.That(verdict.WonByFor(GreetName, Winner.WithSkill)).IsTrue();
        await Assert.That(verdict.HasReasonFor(EchoName, new JudgeReason("skill clarifies intent"))).IsTrue();
    }

    [Test]
    public async Task ShouldRecordOneEvaluationRunPerModePerScenario()
    {
        var runner = A.Fake<IAgentRunner>();
        StubAnyRun(runner, "baseline-output", "skill-output");
        var judge = StubJudgeFavoring(Winner.Baseline);
        var reporter = A.Fake<IReporter>();

        var handler = new EvaluateSkillHandler(runner, judge, reporter);

        var verdict = await handler.Handle(
            new EvaluateSkillCommand(TargetSkill, new Scenarios([EchoScenario])),
            CancellationToken.None);

        await Assert.That(verdict.HasRunCountFor(EchoName, 2)).IsTrue();
        await Assert.That(verdict.ContainsRunFor(EchoName, RunMode.Baseline, new AgentOutput("baseline-output"))).IsTrue();
        await Assert.That(verdict.ContainsRunFor(EchoName, RunMode.Isolated, new AgentOutput("skill-output"))).IsTrue();
    }

    [Test]
    public async Task ShouldEmitTheSkillVerdictThroughTheReporter()
    {
        var runner = A.Fake<IAgentRunner>();
        StubAnyRun(runner, "base", "skill");
        var judge = StubJudgeFavoring(Winner.WithSkill);
        var reporter = A.Fake<IReporter>();

        var handler = new EvaluateSkillHandler(runner, judge, reporter);

        _ = await handler.Handle(
            new EvaluateSkillCommand(TargetSkill, new Scenarios([EchoScenario])),
            CancellationToken.None);

        A.CallTo(() => reporter.EmitAsync(A<SkillVerdict>._, A<CancellationToken>._))
            .MustHaveHappenedOnceExactly();
    }

    [Test]
    public async Task ShouldEmitTheVerdictThatTheHandlerReturned()
    {
        var runner = A.Fake<IAgentRunner>();
        StubAnyRun(runner, "base", "skill");
        var judge = StubJudgeFavoring(Winner.WithSkill);
        var reporter = A.Fake<IReporter>();
        SkillVerdict? captured = null;
        A.CallTo(() => reporter.EmitAsync(A<SkillVerdict>._, A<CancellationToken>._))
            .Invokes((SkillVerdict v, CancellationToken _) => captured = v)
            .Returns(Task.CompletedTask);

        var handler = new EvaluateSkillHandler(runner, judge, reporter);

        var returned = await handler.Handle(
            new EvaluateSkillCommand(TargetSkill, new Scenarios([EchoScenario])),
            CancellationToken.None);

        await Assert.That(captured).IsNotNull();
        await Assert.That(captured!.IsFor(TargetSkill)).IsTrue();
        await Assert.That(ReferenceEquals(captured, returned)).IsTrue();
    }

    [Test]
    public async Task ShouldRejectEmptyScenarioCollection()
    {
        await Assert.That(() => new Scenarios([])).Throws<ArgumentException>();
    }

    [Test]
    public async Task ShouldPreferWithSkillWhenItPassesMoreAssertionsThanBaseline()
    {
        // Judge deliberately says Baseline wins — assertions should override it
        var judge = A.Fake<IJudge>();
        A.CallTo(() => judge.CompareAsync(A<AgentOutput>._, A<AgentOutput>._, A<CancellationToken>._))
            .Returns(new JudgeDecision(Winner.Baseline, new JudgeReason("judge says baseline")));

        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, RunMode.Baseline, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("just write code")));
        A.CallTo(() => runner.RunAsync(A<Scenario>._, RunMode.Isolated, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("you should write an outside-in acceptance test first")));

        // Both assertions pass for withSkill output; both fail for baseline output
        var scenario = Scenario.Create(
            name: "assertion-winner",
            prompt: "How should I approach this feature?",
            assertions:
            [
                new OutputContains(new Needle("outside-in")),
                new OutputContains(new Needle("acceptance test"))
            ]);

        var handler = new EvaluateSkillHandler(runner, judge, A.Fake<IReporter>());
        var command = new EvaluateSkillCommand(TargetSkill, new Scenarios([scenario]));

        var verdict = await handler.Handle(command, CancellationToken.None);

        // Assertion pass counts should override the judge: withSkill wins (2 passes vs 0)
        await Assert.That(verdict.AllWonBy(Winner.WithSkill)).IsTrue();
    }

    private static void StubAnyRun(IAgentRunner runner, string baselineText, string withSkillText)
    {
        A.CallTo(() => runner.RunAsync(A<Scenario>._, RunMode.Baseline, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput(baselineText)));
        A.CallTo(() => runner.RunAsync(A<Scenario>._, RunMode.Isolated, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput(withSkillText)));
    }

    private static IJudge StubJudgeFavoring(Winner winner, string reason = "stub")
    {
        var judge = A.Fake<IJudge>();
        A.CallTo(() => judge.CompareAsync(A<AgentOutput>._, A<AgentOutput>._, A<CancellationToken>._))
            .Returns(new JudgeDecision(winner, new JudgeReason(reason)));
        return judge;
    }
}
