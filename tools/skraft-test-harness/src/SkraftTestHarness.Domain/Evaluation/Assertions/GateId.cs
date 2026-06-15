namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>Identifier of a gate inside a quality-gates evidence log (e.g. <c>G_mutation</c>, <c>G1</c>).</summary>
public sealed class GateId : StringValueObject
{
    public GateId(string value) : base(value, nameof(value)) { }
}
