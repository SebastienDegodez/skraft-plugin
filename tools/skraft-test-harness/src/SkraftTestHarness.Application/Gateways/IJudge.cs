using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Application.Gateways;

/// <summary>
/// Output gateway : asks an LLM judge to pairwise compare a baseline
/// agent output against a skill-enhanced one. Implementations live in
/// Infrastructure (real Copilot SDK judge, mock deterministic judge…).
/// </summary>
public interface IJudge
{
    Task<JudgeDecision> CompareAsync(
        AgentOutput baseline,
        AgentOutput withSkill,
        CancellationToken cancellationToken);
}
