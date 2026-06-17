namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>Passes when the agent output does NOT match the configured regex pattern.</summary>
public sealed class OutputNotMatches : Assertion
{
    private readonly RegexPattern _pattern;

    public OutputNotMatches(RegexPattern pattern)
    {
        _pattern = pattern ?? throw new ArgumentNullException(nameof(pattern));
    }

    public override AssertionResult Evaluate(AgentRunResult runResult, WorkspaceView workspaceView)
    {
        var description = new AssertionDescription($"output does not match /{_pattern}/");
        if (runResult.Output().Matches(_pattern))
            return new AssertionFailed(description, new FailureReason($"output matched forbidden pattern /{_pattern}/"));
        return new AssertionPassed(description);
    }
}
