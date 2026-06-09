using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Application.Gateways;

/// <summary>
/// Output gateway: loads a skill's scenario suite from a persistence
/// medium (YAML files on disk, in-memory fixtures, …) into the Domain
/// first-class collection <see cref="Scenarios"/>. Infrastructure
/// adapters own the I/O and DTO mapping.
/// </summary>
public interface IScenarioLoader
{
    Task<Scenarios> LoadAsync(string testsDirectory, CancellationToken cancellationToken);
}
