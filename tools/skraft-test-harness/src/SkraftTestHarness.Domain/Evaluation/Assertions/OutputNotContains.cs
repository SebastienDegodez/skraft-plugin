namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>Passes when the agent output does NOT contain the configured needle (case-insensitive).</summary>
public sealed class OutputNotContains : Assertion
{
    private readonly Needle _needle;

    public OutputNotContains(Needle needle)
    {
        _needle = needle ?? throw new ArgumentNullException(nameof(needle));
    }

    public override AssertionResult Evaluate(AgentRunResult runResult, WorkspaceView workspaceView)
    {
        var description = new AssertionDescription($"output does not contain \"{_needle}\"");
        if (runResult.Output().Contains(_needle))
            return new AssertionFailed(description, new FailureReason($"output contained forbidden text \"{_needle}\""));
        return new AssertionPassed(description);
    }
}
