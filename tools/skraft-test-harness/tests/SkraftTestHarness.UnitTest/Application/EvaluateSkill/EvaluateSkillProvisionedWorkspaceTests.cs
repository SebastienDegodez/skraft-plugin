using FakeItEasy;
using SkraftTestHarness.Application.EvaluateSkill;
using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Domain.Skills;

namespace SkraftTestHarness.UnitTest.Application.EvaluateSkill;

/// <summary>
/// RED: when a scenario declares <c>workspace:</c>, the handler must
/// provision one fresh clone PER RUN (baseline + with-skill), run the
/// agent inside that clone, and resolve the workspace assertions
/// against the same clone. Scenarios without a declaration keep the
/// default probe and the plain run path.
/// </summary>
public sealed class EvaluateSkillProvisionedWorkspaceTests
{
    private static readonly SkillReference TargetSkill = new("skraft-orchestrator");

    private static Scenario DeclaringScenario() => Scenario.Create(
        "Design phase",
        prompt: "Run the DESIGN phase.",
        tags: [],
        workspace: WorkspaceRequirement.FromFixture("clean-architecture-app", "after-discuss"),
        assertions: [new FileMatchesGlob(new GlobPattern("adrs/adr-*.md"))]);

    [Test]
    public async Task ShouldProvisionOneWorkspacePerRunMode()
    {
        var workspaces = A.Fake<IScenarioWorkspaces>();
        A.CallTo(() => workspaces.ProvisionFor(A<Scenario>._))
            .ReturnsNextFromSequence(
                Provisioned("/tmp/clone-baseline"),
                Provisioned("/tmp/clone-withskill"));
        var runner = StubWorkspaceRunner();

        var handler = Handler(runner, workspaces);

        _ = await handler.Handle(
            new EvaluateSkillCommand(TargetSkill, new Scenarios([DeclaringScenario()])),
            CancellationToken.None);

        A.CallTo(() => workspaces.ProvisionFor(A<Scenario>._)).MustHaveHappenedTwiceExactly();
        A.CallTo(() => runner.RunInWorkspaceAsync(
                A<Scenario>._, RunMode.Baseline, "/tmp/clone-baseline", A<CancellationToken>._))
            .MustHaveHappenedOnceExactly();
        A.CallTo(() => runner.RunInWorkspaceAsync(
                A<Scenario>._, RunMode.Isolated, "/tmp/clone-withskill", A<CancellationToken>._))
            .MustHaveHappenedOnceExactly();
    }

    [Test]
    public async Task ShouldResolveAssertionsAgainstEachRunsOwnClone()
    {
        var baselineProbe = A.Fake<IWorkspaceProbe>();
        var withSkillProbe = A.Fake<IWorkspaceProbe>();
        var workspaces = A.Fake<IScenarioWorkspaces>();
        A.CallTo(() => workspaces.ProvisionFor(A<Scenario>._))
            .ReturnsNextFromSequence(
                new ProvisionedWorkspace("/tmp/clone-baseline", baselineProbe),
                new ProvisionedWorkspace("/tmp/clone-withskill", withSkillProbe));

        var handler = Handler(StubWorkspaceRunner(), workspaces);

        _ = await handler.Handle(
            new EvaluateSkillCommand(TargetSkill, new Scenarios([DeclaringScenario()])),
            CancellationToken.None);

        A.CallTo(() => baselineProbe.AnyMatches(A<GlobPattern>._)).MustHaveHappenedOnceExactly();
        A.CallTo(() => withSkillProbe.AnyMatches(A<GlobPattern>._)).MustHaveHappenedOnceExactly();
    }

    [Test]
    public async Task ScenarioWithoutWorkspace_ShouldKeepThePlainRunPath()
    {
        var workspaces = A.Fake<IScenarioWorkspaces>();
        A.CallTo(() => workspaces.ProvisionFor(A<Scenario>._)).Returns(null);
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, A<RunMode>._, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("done")));

        var handler = Handler(runner, workspaces);
        var scenario = Scenario.Create(
            "No workspace", "Say hi.", [new OutputContains(new Needle("done"))]);

        _ = await handler.Handle(
            new EvaluateSkillCommand(TargetSkill, new Scenarios([scenario])),
            CancellationToken.None);

        A.CallTo(() => runner.RunAsync(A<Scenario>._, A<RunMode>._, A<CancellationToken>._))
            .MustHaveHappenedTwiceExactly();
        A.CallTo(() => runner.RunInWorkspaceAsync(
                A<Scenario>._, A<RunMode>._, A<string>._, A<CancellationToken>._))
            .MustNotHaveHappened();
    }

    private static ProvisionedWorkspace Provisioned(string root)
        => new(root, A.Fake<IWorkspaceProbe>());

    private static IAgentRunner StubWorkspaceRunner()
    {
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunInWorkspaceAsync(
                A<Scenario>._, A<RunMode>._, A<string>._, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("done")));
        return runner;
    }

    private static EvaluateSkillHandler Handler(IAgentRunner runner, IScenarioWorkspaces workspaces)
    {
        var judge = A.Fake<IJudge>();
        A.CallTo(() => judge.CompareAsync(A<AgentOutput>._, A<AgentOutput>._, A<CancellationToken>._))
            .Returns(new JudgeDecision(Winner.Tie, new JudgeReason("tie")));
        return new EvaluateSkillHandler(
            runner, judge, A.Fake<IReporter>(),
            A.Fake<IWorkspaceProbe>(), A.Fake<IAssertionJudge>(), workspaces);
    }
}
