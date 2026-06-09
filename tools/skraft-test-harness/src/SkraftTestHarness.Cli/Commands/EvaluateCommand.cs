using System.CommandLine;
using SkraftTestHarness.Application.EvaluateSkill;
using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Domain.Skills;
using SkraftTestHarness.Infrastructure.Mock;
using SkraftTestHarness.Infrastructure.Reporting;
using SkraftTestHarness.Infrastructure.Yaml;

namespace SkraftTestHarness.Cli.Commands;

/// <summary>
/// <c>evaluate</c> sub-command: loads scenarios from an <c>eval.yaml</c>
/// file via the <see cref="IScenarioLoader"/> gateway, runs them
/// against a skill and prints the resulting <see cref="SkillVerdict"/>.
/// In <c>--mock</c> mode the runner and judge are replaced by
/// deterministic in-memory stubs so the end-to-end pipeline can be
/// exercised without any LLM call.
/// </summary>
public static class EvaluateCommand
{
    public static Command Build(TextWriter output)
    {
        var command = new Command("evaluate", "Evaluate a skill against its scenario suite.");

        var skillOption = new Option<string>("--skill")
        {
            Description = "Identifier of the skill to evaluate (e.g. outside-in-tdd).",
            Required = true,
        };
        var testsDirOption = new Option<string>("--tests-dir")
        {
            Description = "Directory containing the skill's eval.yaml scenario file.",
            Required = true,
        };
        var mockOption = new Option<bool>("--mock")
        {
            Description = "Run with deterministic in-memory stubs (no LLM call).",
        };
        var reportDirOption = new Option<string?>("--report-dir")
        {
            Description = "Directory where the JSON SkillVerdict report is written. When omitted, no report file is produced.",
        };

        command.Options.Add(skillOption);
        command.Options.Add(testsDirOption);
        command.Options.Add(mockOption);
        command.Options.Add(reportDirOption);

        command.SetAction(async (parseResult, cancellationToken) =>
        {
            var skillId = parseResult.GetValue(skillOption)!;
            var testsDir = parseResult.GetValue(testsDirOption)!;
            var mock = parseResult.GetValue(mockOption);
            var reportDir = parseResult.GetValue(reportDirOption);

            if (!mock)
            {
                await output.WriteLineAsync("Only --mock mode is wired in this walking skeleton.");
                return 2;
            }

            IScenarioLoader loader = new YamlEvalLoader();
            var scenarios = await loader.LoadAsync(testsDir, cancellationToken);

            IReporter reporter = string.IsNullOrWhiteSpace(reportDir)
                ? new MockReporter()
                : new JsonReporter(ReportTarget.Directory(reportDir), TimeProvider.System);

            var handler = new EvaluateSkillHandler(new MockAgentRunner(), new MockJudge(), reporter);
            var skill = new SkillReference(skillId);

            var verdict = await handler.Handle(
                new EvaluateSkillCommand(skill, scenarios),
                cancellationToken);

            var winnerLine = verdict.AllWonBy(Winner.WithSkill)
                ? "winner: with-skill"
                : "winner: other";

            await output.WriteLineAsync(
                $"SkillVerdict(skill={skillId}, scenarios={scenarios.Count()}, {winnerLine})");
            return 0;
        });

        return command;
    }
}
