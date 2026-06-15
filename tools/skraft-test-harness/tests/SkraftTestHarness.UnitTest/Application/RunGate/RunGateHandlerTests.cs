using FakeItEasy;
using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Application.RunGate;
using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Domain.Skills;

namespace SkraftTestHarness.UnitTest.Application.RunGate;

/// <summary>
/// Outer-loop acceptance tests for the <c>RunGate</c> use case — the
/// absolute PASS/FAIL workflow gate. Entry point: the handler. One run
/// only (<see cref="RunMode.Isolated"/>), no baseline, no pairwise judge.
/// </summary>
public sealed class RunGateHandlerTests
{
    private static RunGateHandler BuildHandler(IAgentRunner runner)
    {
        // No workspace declared: the provisioner returns null, so the run
        // executes in the ambient directory via RunAsync (FakeItEasy would
        // otherwise hand back a dummy ProvisionedWorkspace, not null).
        var workspaces = A.Fake<IScenarioWorkspaces>();
        A.CallTo(() => workspaces.ProvisionFor(A<Scenario>._)).Returns(null);

        return new(
            runner,
            A.Fake<IWorkspaceProbe>(),
            A.Fake<IAssertionJudge>(),
            workspaces);
    }

    private static Scenarios OneScenarioRequiring(string needle)
        => new(new[]
        {
            Scenario.Create("Echo", "Say hello.", [new OutputContains(new Needle(needle))]),
        });

    [Test]
    public async Task PassesWhenEveryAssertionPasses()
    {
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, A<RunMode>._, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("hello from the agent")));
        var handler = BuildHandler(runner);

        var verdict = await handler.Handle(
            new RunGateCommand(new SkillReference("demo"), OneScenarioRequiring("hello")),
            CancellationToken.None);

        await Assert.That(verdict.IsPass()).IsTrue();
    }

    [Test]
    public async Task FailsWhenAnyAssertionFails()
    {
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, A<RunMode>._, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("goodbye world")));
        var handler = BuildHandler(runner);

        var verdict = await handler.Handle(
            new RunGateCommand(new SkillReference("demo"), OneScenarioRequiring("hello")),
            CancellationToken.None);

        await Assert.That(verdict.IsPass()).IsFalse();
    }

    [Test]
    public async Task RunsExactlyOnceInIsolatedMode()
    {
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, A<RunMode>._, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("hello")));
        var handler = BuildHandler(runner);

        await handler.Handle(
            new RunGateCommand(new SkillReference("demo"), OneScenarioRequiring("hello")),
            CancellationToken.None);

        A.CallTo(() => runner.RunAsync(A<Scenario>._, RunMode.Isolated, A<CancellationToken>._))
            .MustHaveHappenedOnceExactly();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, RunMode.Baseline, A<CancellationToken>._))
            .MustNotHaveHappened();
    }
}
