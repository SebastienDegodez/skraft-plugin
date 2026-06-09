using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Domain.Skills;

namespace SkraftTestHarness.Application.ConsolidateResults;

/// <summary>
/// Application use case: takes N <see cref="SkillVerdict"/>s (from
/// independent skill runs) and produces a single
/// <see cref="AggregateReport"/> summarizing per-winner scenario counts
/// plus a per-skill breakdown.
/// </summary>
public sealed class ConsolidateResultsHandler
{
    public Task<AggregateReport> Handle(ConsolidateResultsCommand command, CancellationToken cancellationToken)
    {
        if (command.Verdicts.Count == 0)
            throw new ArgumentException("At least one verdict is required.", nameof(command));

        var overallCounts = new Dictionary<Winner, int>();
        var perSkillCounts = new Dictionary<SkillReference, Dictionary<Winner, int>>();

        foreach (var verdict in command.Verdicts)
        {
            verdict.AccumulateTally((skill, winner) =>
            {
                overallCounts[winner] = overallCounts.GetValueOrDefault(winner) + 1;

                if (!perSkillCounts.ContainsKey(skill))
                    perSkillCounts[skill] = new Dictionary<Winner, int>();
                perSkillCounts[skill][winner] = perSkillCounts[skill].GetValueOrDefault(winner) + 1;
            });
        }

        var overallTally = WinnerTally.From(overallCounts);
        var breakdown = SkillBreakdown.From(perSkillCounts.ToDictionary(
            kvp => kvp.Key,
            kvp => WinnerTally.From(kvp.Value)));

        return Task.FromResult(AggregateReport.From(overallTally, breakdown));
    }
}
