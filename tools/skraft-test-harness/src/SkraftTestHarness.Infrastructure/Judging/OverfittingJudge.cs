using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Domain.Evaluation.Judging;

namespace SkraftTestHarness.Infrastructure.Judging;

/// <summary>
/// <see cref="IJudge"/> adapter that detects keyword overfitting: flags
/// when the with-skill answer merely echoes assertion vocabulary rather
/// than providing a genuinely better response.
/// Decision priority:
///   1. Identical outputs → Tie.
///   2. Keyword stuffing (no sentence punctuation in with-skill) → Baseline.
///   3. High word-overlap ratio via <see cref="OverfittingScore"/> → Baseline.
///   4. Length heuristic: longer answer wins.
/// </summary>
public sealed class OverfittingJudge : IJudge
{
    public Task<JudgeDecision> CompareAsync(
        AgentOutput baseline,
        AgentOutput withSkill,
        CancellationToken cancellationToken)
    {
        if (baseline.Equals(withSkill))
            return Task.FromResult(Decide(Winner.Tie, "identical outputs"));

        if (IsKeywordStuffed(withSkill, baseline))
            return Task.FromResult(Decide(Winner.Baseline, "keyword stuffing detected"));

        var score = OverfittingScore.Between(withSkill, baseline);
        if (score.IsOverfitted())
            return Task.FromResult(Decide(Winner.Baseline, "answer overfits to baseline vocabulary"));

        var withSkillLen = CountWords(withSkill.ToString());
        var baselineLen  = CountWords(baseline.ToString());
        var winner = withSkillLen > baselineLen ? Winner.WithSkill
                   : withSkillLen < baselineLen ? Winner.Baseline
                   : Winner.Tie;

        return Task.FromResult(Decide(winner, "length-based heuristic"));
    }

    private static bool IsKeywordStuffed(AgentOutput withSkill, AgentOutput baseline)
    {
        var withSkillText = withSkill.ToString();
        var baselineText  = baseline.ToString();
        var withSkillHasPunctuation = withSkillText.Any(static c => c is '.' or ',' or '!' or '?');
        var baselineHasPunctuation  = baselineText.Any(static c => c is '.' or ',' or '!' or '?');
        return !withSkillHasPunctuation && baselineHasPunctuation;
    }

    private static int CountWords(string text)
        => text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).Length;

    private static JudgeDecision Decide(Winner winner, string reason)
        => new(winner, new JudgeReason(reason));
}
