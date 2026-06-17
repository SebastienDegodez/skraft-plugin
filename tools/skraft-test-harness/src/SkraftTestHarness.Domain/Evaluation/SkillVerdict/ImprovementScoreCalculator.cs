namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Pure Domain reducer collapsing a <see cref="ScenarioVerdicts"/> into
/// a single <see cref="ImprovementScore"/>. Each <see cref="Winner.WithSkill"/>
/// contributes <c>+1</c>, each <see cref="Winner.Baseline"/> contributes
/// <c>-1</c>, and each <see cref="Winner.Tie"/> contributes <c>0</c>;
/// the arithmetic mean of these contributions is the returned score.
/// </summary>
public static class ImprovementScoreCalculator
{
    public static ImprovementScore For(ScenarioVerdicts verdicts)
    {
        ArgumentNullException.ThrowIfNull(verdicts);
        var withSkill = verdicts.CountWonBy(Winner.WithSkill);
        var baseline = verdicts.CountWonBy(Winner.Baseline);
        var total = verdicts.Total();
        return new ImprovementScore((double)(withSkill - baseline) / total);
    }
}
