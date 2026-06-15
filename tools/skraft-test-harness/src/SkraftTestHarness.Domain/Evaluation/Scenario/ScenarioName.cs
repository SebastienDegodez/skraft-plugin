namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>Non-empty scenario name.</summary>
public sealed class ScenarioName : StringValueObject
{
    public ScenarioName(string value) : base(value, nameof(value)) { }
}
