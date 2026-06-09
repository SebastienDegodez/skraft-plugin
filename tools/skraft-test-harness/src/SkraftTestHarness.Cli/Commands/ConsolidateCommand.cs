using System.CommandLine;
using SkraftTestHarness.Application.ConsolidateResults;
using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Infrastructure.Reporting;

namespace SkraftTestHarness.Cli.Commands;

/// <summary>
/// <c>consolidate</c> sub-command: reads JSON <c>SkillVerdict</c> report
/// files from <c>--results-dir</c> via <see cref="JsonVerdictLoader"/>,
/// aggregates them into an <see cref="AggregateReport"/> through
/// <see cref="ConsolidateResultsHandler"/> and prints a summary using
/// a <see cref="ConsoleSummaryRenderer"/> (Tell-Don't-Ask visitor).
/// </summary>
public static class ConsolidateCommand
{
    public static Command Build(TextWriter output)
    {
        var command = new Command("consolidate", "Aggregate JSON verdict reports.");

        var resultsDirOption = new Option<string>("--results-dir")
        {
            Description = "Directory containing JSON SkillVerdict report files.",
            Required = true,
        };

        command.Options.Add(resultsDirOption);

        command.SetAction(async (parseResult, cancellationToken) =>
        {
            var dir = parseResult.GetValue(resultsDirOption)!;

            var loader = new JsonVerdictLoader();
            var verdicts = (await loader.LoadAllAsync(dir, cancellationToken)).ToList();

            if (verdicts.Count == 0)
                return 1;

            var handler = new ConsolidateResultsHandler();
            var report = await handler.Handle(
                new ConsolidateResultsCommand(verdicts), cancellationToken);

            report.RenderTo(new ConsoleSummaryRenderer(output));
            return 0;
        });

        return command;
    }

    private sealed class ConsoleSummaryRenderer : IAggregateReportRenderer
    {
        private readonly TextWriter _output;

        internal ConsoleSummaryRenderer(TextWriter output) => _output = output;

        public void OnOverall(int withSkill, int baseline, int tie, int total)
            => _output.WriteLine(
                $"Overall: WithSkill={withSkill} Baseline={baseline} Tie={tie} / Total={total}");

        public void OnSkillBreakdown(string skillId, int withSkill, int baseline, int tie)
            => _output.WriteLine(
                $"  {skillId}: WithSkill={withSkill} Baseline={baseline} Tie={tie}");
    }
}

