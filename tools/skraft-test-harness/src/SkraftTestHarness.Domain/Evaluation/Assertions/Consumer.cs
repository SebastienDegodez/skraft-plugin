namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>Identifier of the downstream phase that consumes an artefact (e.g. <c>04-DISTILL</c>, <c>next-phases</c>).</summary>
public sealed class Consumer : StringValueObject
{
    public Consumer(string value) : base(value, nameof(value)) { }
}
