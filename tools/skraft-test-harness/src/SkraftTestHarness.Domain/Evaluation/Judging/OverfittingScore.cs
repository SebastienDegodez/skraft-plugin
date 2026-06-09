using System.Text.RegularExpressions;

namespace SkraftTestHarness.Domain.Evaluation.Judging;

/// <summary>
/// Pure Domain VO that measures how much the with-skill answer
/// echoes vocabulary from the baseline (word-overlap ratio).
/// A high ratio suggests the answer is overfitted rather than
/// genuinely better.
/// Object Calisthenics: 1 instance field, no getters.
/// </summary>
public sealed class OverfittingScore
{
    private readonly double _ratio;

    private OverfittingScore(double ratio) => _ratio = ratio;

    /// <summary>
    /// Computes the fraction of unique words in <paramref name="withSkill"/>
    /// that also appear in <paramref name="baseline"/> (case-insensitive).
    /// </summary>
    public static OverfittingScore Between(AgentOutput withSkill, AgentOutput baseline)
    {
        var withSkillWords = Tokenize(withSkill.ToString());
        if (withSkillWords.Length == 0) return new OverfittingScore(0);

        var baselineSet = new HashSet<string>(
            Tokenize(baseline.ToString()),
            StringComparer.OrdinalIgnoreCase);

        var shared = withSkillWords.Count(w => baselineSet.Contains(w));
        return new OverfittingScore((double)shared / withSkillWords.Length);
    }

    /// <summary>Returns true when &gt;80 % of with-skill words also appear in baseline.</summary>
    public bool IsOverfitted() => _ratio > 0.8;

    private static string[] Tokenize(string text)
        => Regex.Split(text, @"[\s\p{P}]+")
                .Where(static w => !string.IsNullOrEmpty(w))
                .ToArray();
}
