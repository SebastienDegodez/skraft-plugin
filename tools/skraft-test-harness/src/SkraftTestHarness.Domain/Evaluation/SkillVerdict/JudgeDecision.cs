namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>Outcome of a pairwise judge call — which side won and why.</summary>
public sealed class JudgeDecision
{
    private readonly Winner _winner;
    private readonly JudgeReason _reason;

    public JudgeDecision(Winner winner, JudgeReason reason)
    {
        _winner = winner;
        _reason = reason ?? throw new ArgumentNullException(nameof(reason));
    }

    internal bool WasWonBy(Winner winner) => _winner == winner;

    internal bool HasReason(JudgeReason reason) => _reason.Equals(reason);

    internal void WithWinner(Action<Winner> use) => use(_winner);

    internal void WithWinnerAndReason(Action<string, string> use)
        => use(_winner.ToString(), _reason.ToString());

    public static JudgeDecision FromAssertions(Winner winner) =>
        new JudgeDecision(winner, new JudgeReason("Assertion pass count comparison"));
}
