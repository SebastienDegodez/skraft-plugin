using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Infrastructure.Mock;

/// <summary>
/// Deterministic <see cref="IAgentRunner"/> for <c>--mock</c> mode:
/// produces canned outputs without any I/O or LLM call, so the whole
/// pipeline can be exercised end-to-end in tests and on developer laptops.
/// </summary>
public sealed class MockAgentRunner : IAgentRunner
{
    private const string BaselineText = "mock baseline: hi";
    private const string WithSkillText = "mock with-skill: hi — improved";

    public Task<AgentRunResult> RunAsync(Scenario scenario, RunMode mode, CancellationToken cancellationToken)
    {
        var text = mode == RunMode.Baseline ? BaselineText : WithSkillText;
        var result = AgentRunResult.OutputOnly(new AgentOutput(text));
        return Task.FromResult(result);
    }
}
