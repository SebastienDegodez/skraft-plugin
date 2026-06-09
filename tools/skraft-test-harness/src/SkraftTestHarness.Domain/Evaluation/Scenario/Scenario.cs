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
        => new(
            new ScenarioSpecification(new ScenarioName(name), new Prompt(prompt)),
            new Assertions(assertions));

    public ScenarioOutcome EvaluateAgainst(AgentRunResult runResult, WorkspaceView workspaceView)
        => new(runResult.Output(), _assertions.EvaluateAgainst(runResult, workspaceView));

    public ScenarioOutcome EvaluateAgainst(AgentRunResult runResult)
        => EvaluateAgainst(runResult, WorkspaceView.Empty());

    public IReadOnlyList<FilePath> CollectDeclaredFilePaths()
        => _assertions.CollectDeclaredFilePaths();

    internal bool IsNamed(ScenarioName name) => _specification.IsNamed(name);

    internal void WithName(Action<string> use) => _specification.WithName(use);

    public void WithPrompt(Action<string> use) => _specification.WithPrompt(use);
}
