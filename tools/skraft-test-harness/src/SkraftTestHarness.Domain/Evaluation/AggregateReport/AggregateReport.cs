using SkraftTestHarness.Domain.Skills;

namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Aggregate root summarizing how many scenarios were won overall by
/// With-Skill vs Baseline vs Tie across N <see cref="SkillVerdict"/>s,
/// plus a per-skill breakdown. Two fields: overall tally + skill
/// breakdown (Object Calisthenics rule 8).
/// </summary>
public sealed class AggregateReport
{
    private readonly WinnerTally _overall;
    private readonly SkillBreakdown _breakdown;

    private AggregateReport(WinnerTally overall, SkillBreakdown breakdown)
    {
        _overall = overall;
        _breakdown = breakdown;
    }

    public static AggregateReport From(WinnerTally overall, SkillBreakdown breakdown)
        => new(overall, breakdown);

    public bool HasWonScenarios(Winner winner, int count)
        => _overall.CountFor(winner) == count;

    public bool HasTotalScenarios(int count)
        => _overall.Total() == count;

    public bool IncludesSkill(SkillReference skill)
        => _breakdown.IncludesSkill(skill);

    /// <summary>
    /// Tell-Don't-Ask: delegates to the overall <see cref="WinnerTally"/>
    /// so callers never reach through the aggregate root.
    /// </summary>
    public ImprovementScore ComputeImprovementScore()
        => _overall.ComputeImprovementScore();

    /// <summary>
    /// Tell-Don't-Ask rendering: pushes overall counts to the renderer
    /// then iterates the per-skill breakdown.
    /// </summary>
    public void RenderTo(IAggregateReportRenderer renderer)
    {
        if (renderer is null) throw new ArgumentNullException(nameof(renderer));

        renderer.OnOverall(
            _overall.CountFor(Winner.WithSkill),
            _overall.CountFor(Winner.Baseline),
            _overall.CountFor(Winner.Tie),
            _overall.Total());

        _breakdown.ForEach((skill, tally) =>
            skill.WithValue(skillId =>
                renderer.OnSkillBreakdown(
                    skillId,
                    tally.CountFor(Winner.WithSkill),
                    tally.CountFor(Winner.Baseline),
                    tally.CountFor(Winner.Tie))));
    }
}
