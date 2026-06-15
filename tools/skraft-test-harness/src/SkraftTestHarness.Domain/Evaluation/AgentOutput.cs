namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Verbatim text produced by the agent during a scenario run.
/// </summary>
public sealed class AgentOutput : IEquatable<AgentOutput>
{
    private readonly string _text;

    public AgentOutput(string text)
    {
        _text = text ?? throw new ArgumentNullException(nameof(text));
    }

    public bool Contains(Needle needle) => needle.IsFoundIn(_text);

    public bool Matches(RegexPattern pattern) => pattern.IsMatchIn(_text);

    public bool Equals(AgentOutput? other) => other is not null && _text == other._text;

    public override bool Equals(object? obj) => obj is AgentOutput other && Equals(other);

    public override int GetHashCode() => _text.GetHashCode(StringComparison.Ordinal);

    public override string ToString() => _text;
}
