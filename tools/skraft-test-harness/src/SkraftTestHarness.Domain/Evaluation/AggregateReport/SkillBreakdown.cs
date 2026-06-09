using SkraftTestHarness.Domain.Skills;

namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// First-class collection mapping each evaluated skill to its
/// <see cref="WinnerTally"/>. Single field (Object Calisthenics rule 8).
/// </summary>
public sealed class SkillBreakdown
{
    private readonly IReadOnlyDictionary<SkillReference, WinnerTally> _tallies;

    private SkillBreakdown(IReadOnlyDictionary<SkillReference, WinnerTally> tallies)
        => _tallies = tallies;

    public static SkillBreakdown From(Dictionary<SkillReference, WinnerTally> tallies)
        => new(new Dictionary<SkillReference, WinnerTally>(tallies));

    public bool IncludesSkill(SkillReference skill) => _tallies.ContainsKey(skill);

    /// <summary>
    /// Tell-Don't-Ask iteration over each skill entry and its tally.
    /// Used by <see cref="AggregateReport.RenderTo"/> to drive the renderer.
    /// </summary>
    internal void ForEach(Action<SkillReference, WinnerTally> callback)
    {
        foreach (var (skill, tally) in _tallies)
            callback(skill, tally);
    }
}
