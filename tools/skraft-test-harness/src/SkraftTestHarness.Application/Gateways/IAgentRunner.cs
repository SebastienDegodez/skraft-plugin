using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Application.Gateways;

/// <summary>
/// Output gateway : runs the agent for a given scenario in a specific
/// <see cref="RunMode"/> and returns the full run result (output plus
/// tool invocations). Implementations live in Infrastructure (real
/// Copilot SDK, mock responder for <c>--mock</c> mode, …).
/// </summary>
public interface IAgentRunner
{
    Task<AgentRunResult> RunAsync(Scenario scenario, RunMode mode, CancellationToken cancellationToken);
}
