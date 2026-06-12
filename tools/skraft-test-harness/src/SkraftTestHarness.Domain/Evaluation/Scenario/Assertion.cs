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
    /// Tell-Don't-Ask hook letting workspace-aware assertions declare
    /// the probes they need resolved before evaluation. Default: nothing
    /// to probe. <see cref="FileExists"/>, <see cref="FileMatchesGlob"/>
    /// and <see cref="FileContains"/> override.
    /// </summary>
    internal virtual void DeclareProbes(WorkspaceProbeRequests sink)
    {
    }
}
