namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Declarative check run against an <see cref="AgentRunResult"/>. Sealed
/// hierarchy — each concrete kind lives in its own file
/// (<see cref="OutputContains"/>, <see cref="OutputMatches"/>,
/// <see cref="ExpectTools"/>, <see cref="RejectTools"/>…).
/// </summary>
public abstract class Assertion
{
    public abstract AssertionResult Evaluate(AgentRunResult runResult, WorkspaceView workspaceView);

    /// <summary>
    /// True for assertions that verify the workspace itself (file
    /// presence/content) and can therefore be checked without any
    /// agent run — the basis of <c>verify-checkpoint</c>.
    /// </summary>
    internal virtual bool ChecksWorkspace => false;

    /// <summary>
    /// Tell-Don't-Ask hook letting workspace-aware assertions declare
    /// the probes they need resolved before evaluation. Default: nothing
    /// to probe. <see cref="FileExists"/>, <see cref="FileMatchesGlob"/>
    /// and <see cref="FileContains"/> override.
    /// </summary>
    internal virtual void DeclareProbes(WorkspaceProbeRequests sink)
    {
    }
}
