namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Evaluates its inner <c>then</c> assertions only when the scenario
/// prompt contains the trigger needle — the mechanism for opt-in
/// requirements (e.g. Microcks is verified only when the prompt asked
/// for it). When the trigger is absent the conditional is inert and
/// passes vacuously, so an unrequested option never produces a false
/// negative. The prompt is captured at load time (assertions do not see
/// the prompt at evaluation).
/// </summary>
public sealed class ConditionalAssertion : Assertion
{
    private readonly string _prompt;
    private readonly Needle _trigger;
    private readonly IReadOnlyList<Assertion> _then;

    public ConditionalAssertion(string prompt, Needle trigger, IReadOnlyList<Assertion> then)
    {
        _prompt = prompt ?? throw new ArgumentNullException(nameof(prompt));
        _trigger = trigger ?? throw new ArgumentNullException(nameof(trigger));
        _then = then ?? throw new ArgumentNullException(nameof(then));
        if (_then.Count == 0)
            throw new ArgumentException("A conditional assertion requires at least one 'then' assertion.", nameof(then));
    }

    private bool IsTriggered => _prompt.Contains(_trigger.ToString(), StringComparison.OrdinalIgnoreCase);

    public override AssertionResult Evaluate(AgentRunResult runResult, WorkspaceView workspaceView)
    {
        ArgumentNullException.ThrowIfNull(workspaceView);
        var description = new AssertionDescription($"when prompt contains \"{_trigger}\", required checks hold");

        if (!IsTriggered)
            return new AssertionPassed(description);

        foreach (var assertion in _then)
        {
            if (!assertion.Evaluate(runResult, workspaceView).IsPass())
            {
                return new AssertionFailed(
                    description,
                    new FailureReason($"prompt requested \"{_trigger}\" but a required check failed"));
            }
        }

        return new AssertionPassed(description);
    }

    internal override bool ChecksWorkspace => true;

    internal override void DeclareProbes(WorkspaceProbeRequests sink)
    {
        ArgumentNullException.ThrowIfNull(sink);
        if (!IsTriggered)
            return;
        foreach (var assertion in _then)
            assertion.DeclareProbes(sink);
    }
}
