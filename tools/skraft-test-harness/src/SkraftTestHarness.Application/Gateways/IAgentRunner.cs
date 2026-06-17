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

    /// <summary>
    /// Runs the agent inside a provisioned workspace clone. Default:
    /// implementations that have no workspace notion run normally.
    /// </summary>
    Task<AgentRunResult> RunInWorkspaceAsync(
        Scenario scenario, RunMode mode, string workspaceRoot, CancellationToken cancellationToken)
        => RunAsync(scenario, mode, cancellationToken);
}
