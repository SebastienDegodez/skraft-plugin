using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Infrastructure.CopilotCli;

namespace SkraftTestHarness.UnitTest.CopilotCli;

/// <summary>
/// Unit tests for <see cref="CopilotCliAgentRunner"/>. A capturing fake
/// <see cref="ICopilotCliInvoker"/> records the prepared invocation and
/// returns a canned JSONL transcript, so both the argument-building and
/// the result-parsing are verified without launching the real CLI.
/// </summary>
public sealed class CopilotCliAgentRunnerTests
{
    private const string AssistantHi =
        """{"type":"assistant.message","data":{"content":"hi from agent"}}""";

    [Test]
    public async Task ShouldReturnOutputParsedFromTheInvokerTranscript()
    {
        var invoker = new CapturingInvoker(AssistantHi);
        var runner = new CopilotCliAgentRunner(invoker, new CopilotCliOptions());

        var result = await runner.RunAsync(ScenarioFor("Say hi."), RunMode.Plugin, CancellationToken.None);

        await Assert.That(result.Output().Contains(new Needle("hi from agent"))).IsTrue();
    }

    [Test]
    public async Task ShouldRunTheScenarioPromptNonInteractively()
    {
        var invoker = new CapturingInvoker(AssistantHi);
        var runner = new CopilotCliAgentRunner(invoker, new CopilotCliOptions());

        await runner.RunAsync(ScenarioFor("List the files."), RunMode.Plugin, CancellationToken.None);

        await Assert.That(HasPair(invoker, "-p", "List the files.")).IsTrue();
        await Assert.That(HasPair(invoker, "--output-format", "json")).IsTrue();
    }

    [Test]
    public async Task ShouldRequestAutonomyFlags()
    {
        var invoker = new CapturingInvoker(AssistantHi);
        var runner = new CopilotCliAgentRunner(invoker, new CopilotCliOptions());

        await runner.RunAsync(ScenarioFor("go"), RunMode.Plugin, CancellationToken.None);

        await Assert.That(invoker.Arguments).Contains("--allow-all-tools");
        await Assert.That(invoker.Arguments).Contains("--no-ask-user");
    }

    [Test]
    public async Task ShouldLoadPluginAndAgentWhenRunningWithTheSkill()
    {
        var invoker = new CapturingInvoker(AssistantHi);
        var options = new CopilotCliOptions(PluginDirectory: "/repo/plugins", AgentId: "software-engineer");
        var runner = new CopilotCliAgentRunner(invoker, options);

        await runner.RunAsync(ScenarioFor("go"), RunMode.Plugin, CancellationToken.None);

        await Assert.That(HasPair(invoker, "--plugin-dir", "/repo/plugins")).IsTrue();
        await Assert.That(HasPair(invoker, "--agent", "software-engineer")).IsTrue();
    }

    [Test]
    public async Task ShouldNotLoadPluginInBaselineMode()
    {
        var invoker = new CapturingInvoker(AssistantHi);
        var options = new CopilotCliOptions(PluginDirectory: "/repo/plugins", AgentId: "software-engineer");
        var runner = new CopilotCliAgentRunner(invoker, options);

        await runner.RunAsync(ScenarioFor("go"), RunMode.Baseline, CancellationToken.None);

        await Assert.That(invoker.Arguments).DoesNotContain("--plugin-dir");
        await Assert.That(invoker.Arguments).DoesNotContain("--agent");
        await Assert.That(invoker.Arguments).Contains("--no-custom-instructions");
    }

    [Test]
    public async Task ShouldPinTheModelWhenConfigured()
    {
        var invoker = new CapturingInvoker(AssistantHi);
        var runner = new CopilotCliAgentRunner(invoker, new CopilotCliOptions(Model: "claude-sonnet-4.6"));

        await runner.RunAsync(ScenarioFor("go"), RunMode.Plugin, CancellationToken.None);

        await Assert.That(HasPair(invoker, "--model", "claude-sonnet-4.6")).IsTrue();
    }

    [Test]
    public async Task ShouldRunInTheConfiguredWorkingDirectory()
    {
        var invoker = new CapturingInvoker(AssistantHi);
        var runner = new CopilotCliAgentRunner(invoker, new CopilotCliOptions(WorkingDirectory: "/tmp/work"));

        await runner.RunAsync(ScenarioFor("go"), RunMode.Plugin, CancellationToken.None);

        await Assert.That(invoker.WorkingDirectory).IsEqualTo("/tmp/work");
    }

    private static Scenario ScenarioFor(string prompt)
        => Scenario.Create("s", prompt, [new OutputContains(new Needle("x"))]);

    private static bool HasPair(CapturingInvoker invoker, string flag, string value)
    {
        var args = invoker.Arguments;
        for (var i = 0; i < args.Count - 1; i++)
            if (args[i] == flag && args[i + 1] == value)
                return true;
        return false;
    }

    private sealed class CapturingInvoker : ICopilotCliInvoker
    {
        private readonly string _stdout;

        public CapturingInvoker(string stdout) => _stdout = stdout;

        public IReadOnlyList<string> Arguments { get; private set; } = Array.Empty<string>();

        public string? WorkingDirectory { get; private set; }

        public Task<string> InvokeAsync(CopilotCliInvocation invocation, CancellationToken cancellationToken)
        {
            Arguments = invocation.Arguments;
            WorkingDirectory = invocation.WorkingDirectory;
            return Task.FromResult(_stdout);
        }
    }
}
