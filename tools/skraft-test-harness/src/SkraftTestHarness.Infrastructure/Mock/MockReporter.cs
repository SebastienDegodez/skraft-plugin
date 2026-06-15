using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Infrastructure.Mock;

/// <summary>
/// No-op <see cref="IReporter"/> adapter used by the <c>--mock</c> mode
/// composition root so the CLI can build while the real reporter
/// (e.g. JsonReporter) is still being delivered.
/// </summary>
public sealed class MockReporter : IReporter
{
    public Task EmitAsync(SkillVerdict verdict, CancellationToken cancellationToken)
        => Task.CompletedTask;
}
