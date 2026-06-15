namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Mode in which the agent is invoked for a single run. Mirrors the
/// A/B/C modes of <c>skill-validator</c>: <see cref="Baseline"/> loads
/// no skill, <see cref="Isolated"/> loads only the target skill,
/// <see cref="Plugin"/> loads the full plugin.
/// </summary>
public enum RunMode
{
    Baseline,
    Isolated,
    Plugin,
}
