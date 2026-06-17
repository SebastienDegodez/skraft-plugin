using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Infrastructure.Mock;

/// <summary>
/// Deterministic <see cref="IAssertionJudge"/> for <c>--mock</c> runs:
/// every judgement passes, so eval suites containing
/// <c>file_judge</c>/<c>output_judge</c> stay runnable in CI without
/// any LLM call. Workspace (file) assertions still resolve against the
/// real provisioned clone.
/// </summary>
public sealed class MockAssertionJudge : IAssertionJudge
{
    public Task<bool> JudgeFilesAsync(GlobPattern pattern, Criterion criterion, CancellationToken cancellationToken)
        => Task.FromResult(true);

    public Task<bool> JudgeOutputAsync(AgentOutput output, Criterion criterion, CancellationToken cancellationToken)
        => Task.FromResult(true);
}
