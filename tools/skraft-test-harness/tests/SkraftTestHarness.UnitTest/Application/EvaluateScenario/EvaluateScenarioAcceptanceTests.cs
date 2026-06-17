using FakeItEasy;
using SkraftTestHarness.Application.EvaluateScenario;
using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.UnitTest.Application.EvaluateScenario;

/// <summary>
/// Outer-loop acceptance tests for the <c>EvaluateScenario</c> use case.
/// Entry point: the handler. Output gateway mocked: <see cref="IAgentRunner"/>.
/// Real domain objects everywhere else (per outside-in-tdd skill).
/// Tests use behaviour probes on the Domain — no getter access
/// (Object Calisthenics rule 9).
/// </summary>
public sealed class EvaluateScenarioAcceptanceTests
{
    [Test]
    public async Task WhenAgentOutputContainsExpectedText_ShouldMarkAllAssertionsAsPassing()
    {
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, A<RunMode>._, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("hello from the agent")));

        var handler = new EvaluateScenarioHandler(runner, A.Fake<IWorkspaceProbe>());
        var scenario = Scenario.Create(
            name: "Echo scenario",
            prompt: "Say hello.",
            assertions: [new OutputContains(new Needle("hello"))]);

        var outcome = await handler.Handle(new EvaluateScenarioCommand(scenario), CancellationToken.None);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsTrue();
    }

    [Test]
    public async Task WhenAgentOutputMissesExpectedText_ShouldMarkSomeAssertionAsNotPassing()
    {
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, A<RunMode>._, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("goodbye world")));

        var handler = new EvaluateScenarioHandler(runner, A.Fake<IWorkspaceProbe>());
        var scenario = Scenario.Create(
            name: "Echo scenario",
            prompt: "Say hello.",
            assertions: [new OutputContains(new Needle("hello"))]);

        var outcome = await handler.Handle(new EvaluateScenarioCommand(scenario), CancellationToken.None);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsFalse();
    }

    [Test]
    public async Task WhenAgentOutputAvoidsForbiddenText_ShouldMarkOutputNotContainsAsPassing()
    {
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, A<RunMode>._, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("clean response")));

        var handler = new EvaluateScenarioHandler(runner, A.Fake<IWorkspaceProbe>());
        var scenario = Scenario.Create(
            name: "Forbidden-word scenario",
            prompt: "Answer without the forbidden word.",
            assertions: [new OutputNotContains(new Needle("TODO"))]);

        var outcome = await handler.Handle(new EvaluateScenarioCommand(scenario), CancellationToken.None);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsTrue();
    }

    [Test]
    public async Task WhenAgentOutputLeaksForbiddenText_ShouldMarkOutputNotContainsAsFailing()
    {
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, A<RunMode>._, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("response with TODO left in")));

        var handler = new EvaluateScenarioHandler(runner, A.Fake<IWorkspaceProbe>());
        var scenario = Scenario.Create(
            name: "Forbidden-word scenario",
            prompt: "Answer without the forbidden word.",
            assertions: [new OutputNotContains(new Needle("TODO"))]);

        var outcome = await handler.Handle(new EvaluateScenarioCommand(scenario), CancellationToken.None);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsFalse();
    }

    [Test]
    public async Task WhenAgentOutputMatchesExpectedPattern_ShouldMarkOutputMatchesAsPassing()
    {
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, A<RunMode>._, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("ticket count: 42")));

        var handler = new EvaluateScenarioHandler(runner, A.Fake<IWorkspaceProbe>());
        var scenario = Scenario.Create(
            name: "Ticket-count scenario",
            prompt: "Report a ticket count.",
            assertions: [new OutputMatches(new RegexPattern(@"ticket count: \d+"))]);

        var outcome = await handler.Handle(new EvaluateScenarioCommand(scenario), CancellationToken.None);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsTrue();
    }

    [Test]
    public async Task WhenAgentOutputDoesNotMatchExpectedPattern_ShouldMarkOutputMatchesAsFailing()
    {
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, A<RunMode>._, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("ticket count: unknown")));

        var handler = new EvaluateScenarioHandler(runner, A.Fake<IWorkspaceProbe>());
        var scenario = Scenario.Create(
            name: "Ticket-count scenario",
            prompt: "Report a ticket count.",
            assertions: [new OutputMatches(new RegexPattern(@"ticket count: \d+"))]);

        var outcome = await handler.Handle(new EvaluateScenarioCommand(scenario), CancellationToken.None);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsFalse();
    }

    [Test]
    public async Task WhenAgentOutputAvoidsForbiddenPattern_ShouldMarkOutputNotMatchesAsPassing()
    {
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, A<RunMode>._, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("no numbers here")));

        var handler = new EvaluateScenarioHandler(runner, A.Fake<IWorkspaceProbe>());
        var scenario = Scenario.Create(
            name: "No-digits scenario",
            prompt: "Describe without digits.",
            assertions: [new OutputNotMatches(new RegexPattern(@"\d+"))]);

        var outcome = await handler.Handle(new EvaluateScenarioCommand(scenario), CancellationToken.None);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsTrue();
    }

    [Test]
    public async Task WhenAgentOutputLeaksForbiddenPattern_ShouldMarkOutputNotMatchesAsFailing()
    {
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, A<RunMode>._, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("price is 42")));

        var handler = new EvaluateScenarioHandler(runner, A.Fake<IWorkspaceProbe>());
        var scenario = Scenario.Create(
            name: "No-digits scenario",
            prompt: "Describe without digits.",
            assertions: [new OutputNotMatches(new RegexPattern(@"\d+"))]);

        var outcome = await handler.Handle(new EvaluateScenarioCommand(scenario), CancellationToken.None);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsFalse();
    }

    [Test]
    public async Task ShouldPassWhenAgentInvokedTheExpectedTool()
    {
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, A<RunMode>._, A<CancellationToken>._))
            .Returns(new AgentRunResult(
                new AgentOutput("done"),
                new ToolInvocations([new ToolName("bash"), new ToolName("view")])));

        var handler = new EvaluateScenarioHandler(runner, A.Fake<IWorkspaceProbe>());
        var scenario = Scenario.Create(
            name: "Tool-use scenario",
            prompt: "Use bash.",
            assertions: [new ExpectTools(new ToolName("bash"))]);

        var outcome = await handler.Handle(new EvaluateScenarioCommand(scenario), CancellationToken.None);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsTrue();
    }

    [Test]
    public async Task ShouldFailWhenExpectedToolWasNotInvoked()
    {
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, A<RunMode>._, A<CancellationToken>._))
            .Returns(new AgentRunResult(
                new AgentOutput("done"),
                new ToolInvocations([new ToolName("view")])));

        var handler = new EvaluateScenarioHandler(runner, A.Fake<IWorkspaceProbe>());
        var scenario = Scenario.Create(
            name: "Tool-use scenario",
            prompt: "Use bash.",
            assertions: [new ExpectTools(new ToolName("bash"))]);

        var outcome = await handler.Handle(new EvaluateScenarioCommand(scenario), CancellationToken.None);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsFalse();
    }

    [Test]
    public async Task ShouldFailWhenAgentInvokedARejectedTool()
    {
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, A<RunMode>._, A<CancellationToken>._))
            .Returns(new AgentRunResult(
                new AgentOutput("done"),
                new ToolInvocations([new ToolName("bash")])));

        var handler = new EvaluateScenarioHandler(runner, A.Fake<IWorkspaceProbe>());
        var scenario = Scenario.Create(
            name: "No-bash scenario",
            prompt: "Do not use bash.",
            assertions: [new RejectTools(new ToolName("bash"))]);

        var outcome = await handler.Handle(new EvaluateScenarioCommand(scenario), CancellationToken.None);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsFalse();
    }

    [Test]
    public async Task ShouldPassWhenAssertedFileExistsInWorkspace()
    {
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, A<RunMode>._, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("done")));

        var probe = A.Fake<IWorkspaceProbe>();
        A.CallTo(() => probe.Exists(A<FilePath>.That.Matches(p => p.ToString() == "output.txt")))
            .Returns(true);

        var handler = new EvaluateScenarioHandler(runner, probe);
        var scenario = Scenario.Create(
            name: "File-creation scenario",
            prompt: "Write output.txt.",
            assertions: [new FileExists(new FilePath("output.txt"))]);

        var outcome = await handler.Handle(new EvaluateScenarioCommand(scenario), CancellationToken.None);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsTrue();
    }

    [Test]
    public async Task ShouldFailWhenAssertedFileIsMissingInWorkspace()
    {
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, A<RunMode>._, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("done")));

        var probe = A.Fake<IWorkspaceProbe>();
        A.CallTo(() => probe.Exists(A<FilePath>._)).Returns(false);

        var handler = new EvaluateScenarioHandler(runner, probe);
        var scenario = Scenario.Create(
            name: "File-creation scenario",
            prompt: "Write output.txt.",
            assertions: [new FileExists(new FilePath("output.txt"))]);

        var outcome = await handler.Handle(new EvaluateScenarioCommand(scenario), CancellationToken.None);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsFalse();
    }

    [Test]
    public async Task ShouldInvokeTheAgentRunnerExactlyOnceInIsolatedMode()
    {
        var runner = A.Fake<IAgentRunner>();
        A.CallTo(() => runner.RunAsync(A<Scenario>._, A<RunMode>._, A<CancellationToken>._))
            .Returns(AgentRunResult.OutputOnly(new AgentOutput("anything")));

        var handler = new EvaluateScenarioHandler(runner, A.Fake<IWorkspaceProbe>());
        var scenario = Scenario.Create(
            name: "Echo scenario",
            prompt: "Say hi.",
            assertions: [new OutputContains(new Needle("anything"))]);

        _ = await handler.Handle(new EvaluateScenarioCommand(scenario), CancellationToken.None);

        A.CallTo(() => runner.RunAsync(scenario, RunMode.Isolated, A<CancellationToken>._))
            .MustHaveHappenedOnceExactly();
    }
}
