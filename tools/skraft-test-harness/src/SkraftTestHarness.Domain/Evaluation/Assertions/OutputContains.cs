namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>Passes when the agent output contains the configured needle (case-insensitive).</summary>
public sealed class OutputContains : Assertion
{
    private readonly Needle _needle;

    public OutputContains(Needle needle)
    {
        _needle = needle ?? throw new ArgumentNullException(nameof(needle));
    }

    public override AssertionResult Evaluate(AgentRunResult runResult, WorkspaceView workspaceView)
    {
        var description = new AssertionDescription($"output contains \"{_needle}\"");
        if (runResult.Output().Contains(_needle))
            return new AssertionPassed(description);
        return new AssertionFailed(description, new FailureReason($"output did not contain \"{_needle}\""));
    }
}
