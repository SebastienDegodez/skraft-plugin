namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Value object tallying scenario-winner counts. Single field
/// (Object Calisthenics rule 8). All queries are Tell-Don't-Ask probes.
/// </summary>
public sealed class WinnerTally
{
    private readonly IReadOnlyDictionary<Winner, int> _scores;

    private WinnerTally(IReadOnlyDictionary<Winner, int> scores) => _scores = scores;

    public static WinnerTally From(Dictionary<Winner, int> counts)
        => new(new Dictionary<Winner, int>(counts));

    public int CountFor(Winner winner) => _scores.GetValueOrDefault(winner, 0);

    public int Total() => _scores.Values.Sum();

    /// <summary>
    /// Tell-Don't-Ask: derives an <see cref="ImprovementScore"/> from this
    /// tally's winner counts without exposing the underlying dictionary.
    /// </summary>
    public ImprovementScore ComputeImprovementScore()
        => ImprovementScore.For(CountFor(Winner.WithSkill), CountFor(Winner.Baseline), Total());
}
