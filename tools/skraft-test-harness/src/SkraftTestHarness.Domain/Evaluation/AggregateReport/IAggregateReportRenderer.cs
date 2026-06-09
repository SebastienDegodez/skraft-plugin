namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Tell-Don't-Ask visitor driven by <see cref="AggregateReport.RenderTo"/>.
/// Receives an overall tally then one call per skill in the breakdown.
/// </summary>
public interface IAggregateReportRenderer
{
    void OnOverall(int withSkill, int baseline, int tie, int total);

    void OnSkillBreakdown(string skillId, int withSkill, int baseline, int tie);
}
