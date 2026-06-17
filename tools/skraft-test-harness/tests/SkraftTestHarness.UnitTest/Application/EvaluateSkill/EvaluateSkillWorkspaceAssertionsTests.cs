using FakeItEasy;
using SkraftTestHarness.Application.EvaluateSkill;
using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Domain.Skills;

namespace SkraftTestHarness.UnitTest.Application.EvaluateSkill;

/// <summary>
/// RED: <c>EvaluateSkill</c> must resolve workspace assertions through
/// <see cref="IWorkspaceProbe"/> and LLM-backed assertions through
/// <see cref="IAssertionJudge"/>, AFTER each agent run (files created
/// by the agent must be visible).
/// </summary>
public sealed class EvaluateSkillWorkspaceAssertionsTests
{
    private static readonly SkillReference TargetSkill = new("skraft-orchestrator");

    [Test]
    public async Task ShouldResolveFileAssertionsThroughTheWorkspaceProbe()
    {
        var runner = StubRunner();
        var probe = A.Fake<IWorkspaceProbe>();
        var handler = Handler(runner, probe, A.Fake<IAssertionJudge>());
        var scenario = Scenario.Create(
            name: "Artefacts present",
            prompt: "Run the phase.",
            assertions: [new FileMatchesGlob(new GlobPattern("reviews/**/deliver-review-*.md"))]);

        _ = await handler.Handle(
            new EvaluateSkillCommand(TargetSkill, new Scenarios([scenario])),
            CancellationToken.None);

        A.CallTo(() => probe.AnyMatches(
                A<GlobPattern>.That.Matches(g => g.ToString() == "reviews/**/deliver-review-*.md")))
            .MustHaveHappenedTwiceExactly(); // baseline + with-skill
    }

    [Test]
    public async Task ShouldResolveOutputJudgementsWithEachRunsOwnOutput()
    {
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, RunMode.Baseline, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("baseline-answer")));
        A.CallTo(() => runner.RunAsync(A<Scenario>._, RunMode.Isolated, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("skill-answer")));

        var assertionJudge = A.Fake<IAssertionJudge>();
        var handler = Handler(runner, A.Fake<IWorkspaceProbe>(), assertionJudge);
        var scenario = Scenario.Create(
            name: "Business language",
            prompt: "Explain.",
            assertions: [new OutputJudge(new Criterion("uses business vocabulary"))]);

        _ = await handler.Handle(
            new EvaluateSkillCommand(TargetSkill, new Scenarios([scenario])),
            CancellationToken.None);

        A.CallTo(() => assertionJudge.JudgeOutputAsync(
                new AgentOutput("baseline-answer"),
                A<Criterion>._,
                A<CancellationToken>._))
            .MustHaveHappenedOnceExactly();
        A.CallTo(() => assertionJudge.JudgeOutputAsync(
                new AgentOutput("skill-answer"),
                A<Criterion>._,
                A<CancellationToken>._))
            .MustHaveHappenedOnceExactly();
    }

    [Test]
    public async Task ShouldResolveFileJudgementsThroughTheAssertionJudge()
    {
        var runner = StubRunner();
        var assertionJudge = A.Fake<IAssertionJudge>();
        var handler = Handler(runner, A.Fake<IWorkspaceProbe>(), assertionJudge);
        var scenario = Scenario.Create(
            name: "ADR quality",
            prompt: "Design.",
            assertions:
            [
                new FileJudge(new GlobPattern("adrs/adr-*.md"), new Criterion("lists alternatives")),
            ]);

        _ = await handler.Handle(
            new EvaluateSkillCommand(TargetSkill, new Scenarios([scenario])),
            CancellationToken.None);

        A.CallTo(() => assertionJudge.JudgeFilesAsync(
                A<GlobPattern>.That.Matches(g => g.ToString() == "adrs/adr-*.md"),
                A<Criterion>.That.Matches(c => c.ToString() == "lists alternatives"),
                A<CancellationToken>._))
            .MustHaveHappenedTwiceExactly(); // baseline + with-skill
    }

    [Test]
    public async Task ShouldProbeTheWorkspaceOnlyAfterTheAgentRan()
    {
        var calls = new List<string>();
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, A<RunMode>._, A<CancellationToken>._))
            .Invokes(() => calls.Add("run"))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("done")));
        var probe = A.Fake<IWorkspaceProbe>();
        A.CallTo(() => probe.Exists(A<FilePath>._))
            .Invokes(() => calls.Add("probe"))
            .Returns(true);

        var handler = Handler(runner, probe, A.Fake<IAssertionJudge>());
        var scenario = Scenario.Create(
            name: "File created",
            prompt: "Write output.txt.",
            assertions: [new FileExists(new FilePath("output.txt"))]);

        _ = await handler.Handle(
            new EvaluateSkillCommand(TargetSkill, new Scenarios([scenario])),
            CancellationToken.None);

        await Assert.That(calls.First()).IsEqualTo("run");
        await Assert.That(calls.Count(c => c == "probe")).IsEqualTo(2);
    }

    private static IAgentRunner StubRunner()
    {
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, A<RunMode>._, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("done")));
        return runner;
    }

    private static EvaluateSkillHandler Handler(
        IAgentRunner runner, IWorkspaceProbe probe, IAssertionJudge assertionJudge)
    {
        var judge = A.Fake<IJudge>();
        A.CallTo(() => judge.CompareAsync(A<AgentOutput>._, A<AgentOutput>._, A<CancellationToken>._))
            .Returns(new JudgeDecision(Winner.Tie, new JudgeReason("tie")));
        return new EvaluateSkillHandler(runner, judge, A.Fake<IReporter>(), probe, assertionJudge);
    }
}
