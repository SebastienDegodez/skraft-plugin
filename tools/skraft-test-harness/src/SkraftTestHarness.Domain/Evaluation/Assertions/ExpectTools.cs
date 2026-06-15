namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>Passes when the agent invoked the configured tool during the run.</summary>
public sealed class ExpectTools : Assertion
{
    private readonly ToolName _tool;

    public ExpectTools(ToolName tool)
    {
        _tool = tool ?? throw new ArgumentNullException(nameof(tool));
    }

    public override AssertionResult Evaluate(AgentRunResult runResult, WorkspaceView workspaceView)
    {
        var description = new AssertionDescription($"agent invoked tool \"{_tool}\"");
        if (runResult.HasInvoked(_tool))
            return new AssertionPassed(description);
        return new AssertionFailed(description, new FailureReason($"agent did not invoke tool \"{_tool}\""));
    }
}
