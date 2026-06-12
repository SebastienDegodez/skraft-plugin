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
    private readonly Tags _tags;

    public ScenarioSpecification(ScenarioName name, Prompt prompt)
        : this(name, prompt, Tags.None())
    {
    }

    public ScenarioSpecification(ScenarioName name, Prompt prompt, Tags tags)
    {
        _name = name ?? throw new ArgumentNullException(nameof(name));
        _prompt = prompt ?? throw new ArgumentNullException(nameof(prompt));
        _tags = tags ?? throw new ArgumentNullException(nameof(tags));
    }

    internal bool IsNamed(ScenarioName name) => _name.Equals(name);

    internal bool IsAcceptedBy(TagFilter filter) => filter.Accepts(_tags);

    internal void WithName(Action<string> use) => use(_name.ToString());

    public void WithPrompt(Action<string> use) => use(_prompt.ToString());
}
