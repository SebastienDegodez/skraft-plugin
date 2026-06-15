namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Aggregated verdict for a single scenario run — pairs the agent
/// output with the assertion results.
/// </summary>
public sealed class ScenarioOutcome
{
    private readonly AgentOutput _output;
    private readonly AssertionResults _results;

    public ScenarioOutcome(AgentOutput output, AssertionResults results)
    {
        _output = output ?? throw new ArgumentNullException(nameof(output));
        _results = results ?? throw new ArgumentNullException(nameof(results));
    }

    public bool AreAllAssertionsPassing() => _results.AreAllPassing();

    public int PassCount() => _results.PassCount();

    public bool Beats(ScenarioOutcome other) => PassCount() > other.PassCount();

    internal bool HasOutput(AgentOutput other) => _output.Equals(other);
}
