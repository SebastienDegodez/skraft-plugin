namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>Passes when the agent did NOT invoke the configured tool during the run.</summary>
public sealed class RejectTools : Assertion
{
    private readonly ToolName _tool;

    public RejectTools(ToolName tool)
    {
        _tool = tool ?? throw new ArgumentNullException(nameof(tool));
    }

    public override AssertionResult Evaluate(AgentRunResult runResult, WorkspaceView workspaceView)
    {
        var description = new AssertionDescription($"agent did not invoke tool \"{_tool}\"");
        if (runResult.HasInvoked(_tool))
            return new AssertionFailed(description, new FailureReason($"agent invoked forbidden tool \"{_tool}\""));
        return new AssertionPassed(description);
    }
}
