using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Application.Gateways;

/// <summary>
/// Output gateway : resolves LLM-backed assertions
/// (<see cref="FileJudge"/>, <see cref="OutputJudge"/>) by asking a
/// judge model whether the artefact satisfies the criterion.
/// Implementations live in Infrastructure (Copilot CLI judge,
/// deterministic mock). Any failure to obtain a verdict must resolve
/// to <c>false</c> — an unjudged criterion never passes.
/// </summary>
public interface IAssertionJudge
{
    Task<bool> JudgeFilesAsync(GlobPattern pattern, Criterion criterion, CancellationToken cancellationToken);

    Task<bool> JudgeOutputAsync(AgentOutput output, Criterion criterion, CancellationToken cancellationToken);
}
