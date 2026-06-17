namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Non-empty natural-language criterion evaluated by an LLM judge on
/// behalf of <see cref="FileJudge"/> and <see cref="OutputJudge"/>
/// (e.g. "the ADR lists at least two alternatives").
/// </summary>
public sealed class Criterion : StringValueObject
{
    public Criterion(string value) : base(value, nameof(value)) { }
}
