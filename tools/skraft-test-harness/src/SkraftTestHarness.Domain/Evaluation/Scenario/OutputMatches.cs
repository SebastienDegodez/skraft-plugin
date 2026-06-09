namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>Passes when the agent output matches the configured regex pattern.</summary>
public sealed class OutputMatches : Assertion
{
    private readonly RegexPattern _pattern;

    public OutputMatches(RegexPattern pattern)
    {
        _pattern = pattern ?? throw new ArgumentNullException(nameof(pattern));
    }

    public override AssertionResult Evaluate(AgentRunResult runResult, WorkspaceView workspaceView)
    {
        var description = new AssertionDescription($"output matches /{_pattern}/");
        if (runResult.Output().Matches(_pattern))
            return new AssertionPassed(description);
        return new AssertionFailed(description, new FailureReason($"output did not match /{_pattern}/"));
    }
}
