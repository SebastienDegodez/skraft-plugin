using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Application.ConsolidateResults;

public sealed record ConsolidateResultsCommand(IReadOnlyCollection<SkillVerdict> Verdicts);
