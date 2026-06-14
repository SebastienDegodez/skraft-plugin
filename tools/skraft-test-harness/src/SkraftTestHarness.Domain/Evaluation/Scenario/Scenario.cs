namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Aggregate root of the Evaluation bounded context. Holds a
/// <see cref="ScenarioSpecification"/> and its <see cref="Assertions"/>
/// (exactly two instance variables — Object Calisthenics rule 8).
/// </summary>
public sealed class Scenario
{
    private readonly ScenarioSpecification _specification;
    private readonly Assertions _assertions;

    private Scenario(ScenarioSpecification specification, Assertions assertions)
    {
        _specification = specification;
        _assertions = assertions;
    }

    /// <summary>
    /// Reconstitution factory for deserialization paths (e.g. loading a
    /// previously persisted <c>SkillVerdict</c> from JSON). The
    /// <c>_assertions</c> field is not populated because reconstituted
    /// scenarios are used only for accumulation/rendering — never for
    /// evaluation. Only <see cref="IsNamed"/> and <see cref="WithName"/>
    /// are called on reconstituted instances.
    /// </summary>
    internal static Scenario ForReconstitution(string name)
        => new(new ScenarioSpecification(new ScenarioName(name), new Prompt("reconstituted")), null!);

    public static Scenario Create(string name, string prompt, IReadOnlyList<Assertion> assertions)
        => Create(name, prompt, tags: [], assertions);

    public static Scenario Create(
        string name, string prompt, IReadOnlyList<string> tags, IReadOnlyList<Assertion> assertions)
        => Create(name, prompt, tags, WorkspaceRequirement.None(), assertions);

    public static Scenario Create(
        string name,
        string prompt,
        IReadOnlyList<string> tags,
        WorkspaceRequirement workspace,
        IReadOnlyList<Assertion> assertions)
        => new(
            new ScenarioSpecification(new ScenarioName(name), new Prompt(prompt), new Tags(tags), workspace),
            new Assertions(assertions));

    /// <summary>Invokes the callback only when the scenario declares a workspace (fixture, baseline, checkpoint).</summary>
    public void WithWorkspace(Action<string, string?, string?> use) => _specification.WithWorkspace(use);

    /// <summary>
    /// Evaluates only the workspace-checking assertions against the
    /// given view — the <c>verify-checkpoint</c> path (no agent run).
    /// </summary>
    public AssertionResults VerifyWorkspaceAssertions(WorkspaceView workspaceView)
        => _assertions.VerifyWorkspace(workspaceView);

    public bool MatchesTags(TagFilter filter)
    {
        ArgumentNullException.ThrowIfNull(filter);
        return _specification.IsAcceptedBy(filter);
    }

    public ScenarioOutcome EvaluateAgainst(AgentRunResult runResult, WorkspaceView workspaceView)
        => new(runResult.Output(), _assertions.EvaluateAgainst(runResult, workspaceView));

    public ScenarioOutcome EvaluateAgainst(AgentRunResult runResult)
        => EvaluateAgainst(runResult, WorkspaceView.Empty());

    public WorkspaceProbeRequests CollectProbeRequests()
        => _assertions.CollectProbeRequests();

    internal bool IsNamed(ScenarioName name) => _specification.IsNamed(name);

    public void WithName(Action<string> use) => _specification.WithName(use);

    public void WithPrompt(Action<string> use) => _specification.WithPrompt(use);
}
