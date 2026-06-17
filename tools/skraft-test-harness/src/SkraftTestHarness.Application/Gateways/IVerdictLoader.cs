using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Application.Gateways;

/// <summary>
/// Input gateway: loads all serialized <see cref="SkillVerdict"/> files
/// from a flat directory into Domain objects. Infrastructure adapters
/// own the I/O and DTO mapping.
/// </summary>
public interface IVerdictLoader
{
    Task<IEnumerable<SkillVerdict>> LoadAllAsync(string directory, CancellationToken cancellationToken);
}
