using System.Text;
using System.Text.Json;
using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Infrastructure.CopilotCli;

namespace SkraftTestHarness.Infrastructure.Judging;

/// <summary>
/// <see cref="IAssertionJudge"/> adapter that asks the Copilot CLI a
/// strict pass/fail question about an artefact or output against a
/// natural-language criterion. The model must answer
/// <c>{"verdict":"pass"|"fail","reason":"…"}</c>; any other answer, an
/// empty file set, or a CLI failure resolves to <c>false</c> — an
/// unjudged criterion never passes.
/// </summary>
public sealed class CopilotCliAssertionJudge : IAssertionJudge
{
    private readonly ICopilotCliInvoker _invoker;
    private readonly IMatchedFilesReader _filesReader;
    private readonly string? _model;

    public CopilotCliAssertionJudge(ICopilotCliInvoker invoker, IMatchedFilesReader filesReader, string? model)
    {
        _invoker = invoker ?? throw new ArgumentNullException(nameof(invoker));
        _filesReader = filesReader ?? throw new ArgumentNullException(nameof(filesReader));
        _model = model;
    }

    public async Task<bool> JudgeFilesAsync(GlobPattern pattern, Criterion criterion, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(pattern);
        ArgumentNullException.ThrowIfNull(criterion);

        var files = _filesReader.ReadMatching(pattern);
        if (files.Count == 0)
            return false;

        var subject = new StringBuilder();
        subject.AppendLine("The artefact files to judge:");
        foreach (var (path, contents) in files)
        {
            subject.AppendLine($"--- file: {path} ---");
            subject.AppendLine(contents);
        }

        return await AskAsync(subject.ToString(), criterion, cancellationToken).ConfigureAwait(false);
    }

    public Task<bool> JudgeOutputAsync(AgentOutput output, Criterion criterion, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(output);
        ArgumentNullException.ThrowIfNull(criterion);
        return AskAsync($"The agent output to judge:\n{output}", criterion, cancellationToken);
    }

    private async Task<bool> AskAsync(string subject, Criterion criterion, CancellationToken cancellationToken)
    {
        var prompt =
            "You are a strict evaluation judge. Decide whether the material below satisfies the criterion.\n"
            + $"Criterion: {criterion}\n\n"
            + subject + "\n\n"
            + "Answer with EXACTLY one JSON object and nothing else: "
            + "{\"verdict\":\"pass\"|\"fail\",\"reason\":\"short justification\"}";

        try
        {
            var stdout = await _invoker.InvokeAsync(BuildInvocation(prompt), cancellationToken).ConfigureAwait(false);
            var answer = ExtractAnswer(CopilotCliTranscript.Parse(stdout));
            return IsPassVerdict(answer);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception)
        {
            return false; // judge unavailable => never a silent pass
        }
    }

    private CopilotCliInvocation BuildInvocation(string prompt)
    {
        var args = new List<string>
        {
            "-p", prompt,
            "--output-format", "json",
            "--no-ask-user",
            "--no-custom-instructions",
            "--log-level", "error",
        };

        if (_model is { Length: > 0 } model)
        {
            args.Add("--model");
            args.Add(model);
        }

        return new CopilotCliInvocation(args, WorkingDirectory: null);
    }

    private static string ExtractAnswer(AgentRunResult result)
        => result.Output().ToString();

    private static bool IsPassVerdict(string answer)
    {
        var start = answer.IndexOf('{');
        var end = answer.LastIndexOf('}');
        if (start < 0 || end <= start)
            return false;

        try
        {
            using var document = JsonDocument.Parse(answer[start..(end + 1)]);
            return document.RootElement.TryGetProperty("verdict", out var verdict)
                && verdict.ValueKind == JsonValueKind.String
                && string.Equals(verdict.GetString(), "pass", StringComparison.OrdinalIgnoreCase);
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
