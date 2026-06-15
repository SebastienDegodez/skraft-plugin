using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Infrastructure.Mock;

/// <summary>
/// Deterministic <see cref="IJudge"/> for <c>--mock</c> mode:
/// always declares the skill-enhanced run the winner with a canned
/// reason, so <c>--mock</c> mode surfaces a green verdict without an
/// LLM round-trip.
/// </summary>
public sealed class MockJudge : IJudge
{
    public Task<JudgeDecision> CompareAsync(
        AgentOutput baseline,
        AgentOutput withSkill,
        CancellationToken cancellationToken)
    {
        var decision = new JudgeDecision(
            Winner.WithSkill,
            new JudgeReason("mock judge: the skill-enhanced output is preferred"));
        return Task.FromResult(decision);
    }
}
