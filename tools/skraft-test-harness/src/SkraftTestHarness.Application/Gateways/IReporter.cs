using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Application.Gateways;

/// <summary>
/// Output gateway: emits a <see cref="SkillVerdict"/> produced by the
/// <c>EvaluateSkill</c> use case to whatever sink the composition root
/// has wired (JSON file, stdout stream, in-memory collector for tests…).
/// Implementations live in Infrastructure.
/// </summary>
public interface IReporter
{
    Task EmitAsync(SkillVerdict verdict, CancellationToken cancellationToken);
}
