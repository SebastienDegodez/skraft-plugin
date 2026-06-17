namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>Name of a tool that the agent invoked during a run (e.g. "bash", "view").</summary>
public sealed class ToolName : StringValueObject
{
    public ToolName(string value) : base(value, nameof(value)) { }
}
