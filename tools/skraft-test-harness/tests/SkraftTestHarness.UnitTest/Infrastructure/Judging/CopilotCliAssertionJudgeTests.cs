using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Infrastructure.CopilotCli;
using SkraftTestHarness.Infrastructure.Judging;

namespace SkraftTestHarness.UnitTest.Infrastructure.Judging;

/// <summary>
/// RED: LLM-backed assertion judge driven through the Copilot CLI.
/// The judge prompt demands a strict JSON answer
/// (<c>{"verdict":"pass"|"fail","reason":"…"}</c>); anything
/// unparseable resolves to fail — never a silent pass.
/// </summary>
public sealed class CopilotCliAssertionJudgeTests
{
    [Test]
    public async Task JudgeOutput_ShouldPass_WhenTheModelAnswersPass()
    {
        var judge = JudgeAnswering("""{"verdict":"pass","reason":"clearly satisfied"}""");

        var passed = await judge.JudgeOutputAsync(
            new AgentOutput("we will start with a failing acceptance test"),
            new Criterion("describes an outside-in TDD start"),
            CancellationToken.None);

        await Assert.That(passed).IsTrue();
    }

    [Test]
    public async Task JudgeOutput_ShouldFail_WhenTheModelAnswersFail()
    {
        var judge = JudgeAnswering("""{"verdict":"fail","reason":"not satisfied"}""");

        var passed = await judge.JudgeOutputAsync(
            new AgentOutput("just write the code"),
            new Criterion("describes an outside-in TDD start"),
            CancellationToken.None);

        await Assert.That(passed).IsFalse();
    }

    [Test]
    public async Task JudgeOutput_ShouldFail_WhenTheModelAnswerIsUnparseable()
    {
        var judge = JudgeAnswering("I think it looks fine overall!");

        var passed = await judge.JudgeOutputAsync(
            new AgentOutput("anything"),
            new Criterion("anything"),
            CancellationToken.None);

        await Assert.That(passed).IsFalse();
    }

    [Test]
    public async Task JudgeOutput_ShouldFail_WhenTheCliInvocationThrows()
    {
        var judge = new CopilotCliAssertionJudge(
            new ThrowingInvoker(),
            new NoFilesReader(),
            model: null);

        var passed = await judge.JudgeOutputAsync(
            new AgentOutput("anything"),
            new Criterion("anything"),
            CancellationToken.None);

        await Assert.That(passed).IsFalse();
    }

    [Test]
    public async Task JudgeFiles_ShouldFail_WhenNoFileMatchesTheGlob()
    {
        var judge = JudgeAnswering("""{"verdict":"pass","reason":"would pass"}""");

        var passed = await judge.JudgeFilesAsync(
            new GlobPattern("adrs/adr-*.md"),
            new Criterion("lists alternatives"),
            CancellationToken.None);

        await Assert.That(passed).IsFalse();
    }

    [Test]
    public async Task JudgeFiles_ShouldIncludeTheMatchedFileContentsInThePrompt()
    {
        var invoker = new RecordingInvoker("""{"verdict":"pass","reason":"ok"}""");
        var judge = new CopilotCliAssertionJudge(
            invoker,
            new FixedFilesReader(new Dictionary<string, string>
            {
                ["adrs/adr-001.md"] = "# ADR 001: choose event sourcing",
            }),
            model: null);

        var passed = await judge.JudgeFilesAsync(
            new GlobPattern("adrs/adr-*.md"),
            new Criterion("lists alternatives"),
            CancellationToken.None);

        await Assert.That(passed).IsTrue();
        await Assert.That(invoker.LastPrompt).Contains("ADR 001: choose event sourcing");
        await Assert.That(invoker.LastPrompt).Contains("lists alternatives");
    }

    private static CopilotCliAssertionJudge JudgeAnswering(string modelAnswer)
        => new(new RecordingInvoker(modelAnswer), new NoFilesReader(), model: null);

    private sealed class RecordingInvoker(string answer) : ICopilotCliInvoker
    {
        public string LastPrompt { get; private set; } = string.Empty;

        public Task<string> InvokeAsync(CopilotCliInvocation invocation, CancellationToken cancellationToken)
        {
            var promptIndex = invocation.Arguments.ToList().IndexOf("-p") + 1;
            LastPrompt = invocation.Arguments[promptIndex];
            var payload = System.Text.Json.JsonSerializer.Serialize(answer);
            var line = """{"type":"assistant.message","data":{"content":""" + payload + "}}";
            return Task.FromResult(line + "\n");
        }
    }

    private sealed class ThrowingInvoker : ICopilotCliInvoker
    {
        public Task<string> InvokeAsync(CopilotCliInvocation invocation, CancellationToken cancellationToken)
            => throw new InvalidOperationException("copilot exploded");
    }

    private sealed class NoFilesReader : IMatchedFilesReader
    {
        public IReadOnlyDictionary<string, string> ReadMatching(GlobPattern pattern)
            => new Dictionary<string, string>();
    }

    private sealed class FixedFilesReader(IReadOnlyDictionary<string, string> files) : IMatchedFilesReader
    {
        public IReadOnlyDictionary<string, string> ReadMatching(GlobPattern pattern) => files;
    }
}
