namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Declarative identity of a scenario — kept as a dedicated VO so that
/// <see cref="Scenario"/> holds exactly two instance variables
/// (Object Calisthenics rule 8).
/// </summary>
public sealed class ScenarioSpecification
{
    private readonly ScenarioName _name;
    private readonly Prompt _prompt;

    public ScenarioSpecification(ScenarioName name, Prompt prompt)
    {
        _name = name ?? throw new ArgumentNullException(nameof(name));
        _prompt = prompt ?? throw new ArgumentNullException(nameof(prompt));
    }

    internal bool IsNamed(ScenarioName name) => _name.Equals(name);

    internal void WithName(Action<string> use) => use(_name.ToString());

    public void WithPrompt(Action<string> use) => use(_prompt.ToString());
}
