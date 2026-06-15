namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>Non-empty user prompt handed to the agent.</summary>
public sealed class Prompt : StringValueObject
{
    public Prompt(string value) : base(value, nameof(value)) { }
}
