using System.CommandLine;
using SkraftTestHarness.Application.RalphLoop;
using SkraftTestHarness.Domain.Skills;
using SkraftTestHarness.Infrastructure.Mock;
using SkraftTestHarness.Infrastructure.Reporting;
using SkraftTestHarness.Infrastructure.Yaml;

namespace SkraftTestHarness.Cli.Commands;

/// <summary>
/// <c>ralph</c> sub-command: runs <c>evaluate</c> N times for the given
/// skill, consolidates all <c>SkillVerdict</c>s into an
/// <c>AggregateReport</c>, prints the <c>ImprovementScore</c>, and exits
/// non-zero when the score falls below <c>--threshold</c>.
/// </summary>
public static class RalphCommand
{
    public static Command Build(TextWriter output)
    {
        var command = new Command("ralph", "Run the evaluate loop N times and consolidate results.");

        var skillOption = new Option<string>("--skill")
        {
            Description = "Identifier of the skill to evaluate.",
            Required = true,
        };
        var testsDirOption = new Option<string>("--tests-dir")
        {
            Description = "Directory containing the skill's eval.yaml scenario file.",
            Required = true,
        };
        var runsOption = new Option<int>("--runs")
        {
            Description = "Number of evaluate iterations to run.",
        };
        runsOption.DefaultValueFactory = _ => 3;

        var thresholdOption = new Option<double?>("--threshold")
        {
            Description = "Exit non-zero when ImprovementScore is below this value.",
        };
        var mockOption = new Option<bool>("--mock")
        {
            Description = "Run with deterministic in-memory stubs (no LLM call).",
        };
        var reportDirOption = new Option<string?>("--report-dir")
        {
            Description = "Directory where JSON reports are written. When omitted, no files are produced.",
        };

        command.Options.Add(skillOption);
        command.Options.Add(testsDirOption);
        command.Options.Add(runsOption);
        command.Options.Add(thresholdOption);
        command.Options.Add(mockOption);
        command.Options.Add(reportDirOption);

        command.SetAction(async (parseResult, cancellationToken) =>
        {
            var skillId = parseResult.GetValue(skillOption)!;
            var testsDir = parseResult.GetValue(testsDirOption)!;
            var runs = parseResult.GetValue(runsOption);
            var threshold = parseResult.GetValue(thresholdOption);
            var reportDir = parseResult.GetValue(reportDirOption);

            var reporter = string.IsNullOrWhiteSpace(reportDir)
                ? (Application.Gateways.IReporter)new MockReporter()
                : new JsonReporter(ReportTarget.Directory(reportDir), TimeProvider.System);

            var handler = new RalphLoopHandler(
                new MockAgentRunner(),
                new MockJudge(),
                new YamlEvalLoader(),
                reporter);

            var loopCommand = new RalphLoopCommand(
                new SkillReference(skillId), testsDir, runs, threshold, reportDir);

            var (report, thresholdPassed) = await handler.Handle(loopCommand, cancellationToken);

            var score = report.ComputeImprovementScore();
            await output.WriteLineAsync($"ImprovementScore: {score}");

            return thresholdPassed ? 0 : 1;
        });

        return command;
    }
}

