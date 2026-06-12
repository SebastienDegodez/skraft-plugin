using System.CommandLine;
using SkraftTestHarness.Application.EvaluateSkill;
using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Domain.Skills;
using SkraftTestHarness.Infrastructure.CopilotCli;
using SkraftTestHarness.Infrastructure.Judging;
using SkraftTestHarness.Infrastructure.Mock;
using SkraftTestHarness.Infrastructure.Reporting;
using SkraftTestHarness.Infrastructure.Workspace;
using SkraftTestHarness.Infrastructure.Yaml;

namespace SkraftTestHarness.Cli.Commands;

/// <summary>
/// <c>evaluate</c> sub-command: loads scenarios from an <c>eval.yaml</c>
/// file via the <see cref="IScenarioLoader"/> gateway, runs each one
/// baseline vs with-skill and prints the resulting <see cref="SkillVerdict"/>.
///
/// Two execution modes:
/// <list type="bullet">
///   <item><c>--mock</c>: deterministic in-memory stubs, no LLM call.</item>
///   <item>default: drives the real <c>copilot</c> CLI via
///   <see cref="CopilotCliAgentRunner"/> and judges with the
///   <see cref="OverfittingJudge"/>. The skill is loaded through
///   <c>--plugin-dir</c>/<c>--agent</c> for the with-skill run.</item>
/// </list>
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
        var pluginDirOption = new Option<string?>("--plugin-dir")
        {
            Description = "Plugin directory loaded for the with-skill run (real mode).",
        };
        var agentOption = new Option<string?>("--agent")
        {
            Description = "Custom Copilot agent loaded for the with-skill run (real mode).",
        };
        var modelOption = new Option<string?>("--model")
        {
            Description = "Model pinned for the Copilot CLI run (real mode).",
        };
        var workingDirOption = new Option<string?>("--working-dir")
        {
            Description = "Working directory the Copilot CLI runs in (real mode).",
        };
        var copilotExeOption = new Option<string>("--copilot-exe")
        {
            Description = "Path or name of the copilot executable (real mode).",
            DefaultValueFactory = _ => "copilot",
        };

        command.Options.Add(skillOption);
        command.Options.Add(testsDirOption);
        command.Options.Add(mockOption);
        command.Options.Add(reportDirOption);
        command.Options.Add(pluginDirOption);
        command.Options.Add(agentOption);
        command.Options.Add(modelOption);
        command.Options.Add(workingDirOption);
        command.Options.Add(copilotExeOption);

        command.SetAction(async (parseResult, cancellationToken) =>
        {
            var skillId = parseResult.GetValue(skillOption)!;
            var testsDir = parseResult.GetValue(testsDirOption)!;
            var mock = parseResult.GetValue(mockOption);
            var reportDir = parseResult.GetValue(reportDirOption);

            IScenarioLoader loader = new YamlEvalLoader();
            var scenarios = await loader.LoadAsync(testsDir, cancellationToken);

            IReporter reporter = string.IsNullOrWhiteSpace(reportDir)
                ? new MockReporter()
                : new JsonReporter(ReportTarget.Directory(reportDir), TimeProvider.System);

            var (agentRunner, judge) = mock
                ? ((IAgentRunner)new MockAgentRunner(), (IJudge)new MockJudge())
                : BuildRealPipeline(parseResult, pluginDirOption, agentOption, modelOption, workingDirOption, copilotExeOption);

            var handler = mock
                ? new EvaluateSkillHandler(agentRunner, judge, reporter)
                : BuildWorkspaceAwareHandler(agentRunner, judge, reporter, parseResult, modelOption, workingDirOption, copilotExeOption);
            var skill = new SkillReference(skillId);

            SkillVerdict verdict;
            try
            {
                verdict = await handler.Handle(new EvaluateSkillCommand(skill, scenarios), cancellationToken);
            }
            catch (Exception ex)
            {
                await output.WriteLineAsync($"evaluation failed: {ex.Message}");
                return 1;
            }

            var winnerLine = verdict.AllWonBy(Winner.WithSkill)
                ? "winner: with-skill"
                : "winner: other";

            await output.WriteLineAsync(
                $"SkillVerdict(skill={skillId}, scenarios={scenarios.Count()}, {winnerLine})");
            return 0;
        });

        return command;
    }

    private static (IAgentRunner, IJudge) BuildRealPipeline(
        System.CommandLine.ParseResult parseResult,
        Option<string?> pluginDirOption,
        Option<string?> agentOption,
        Option<string?> modelOption,
        Option<string?> workingDirOption,
        Option<string> copilotExeOption)
    {
        var options = new CopilotCliOptions(
            PluginDirectory: parseResult.GetValue(pluginDirOption),
            AgentId: parseResult.GetValue(agentOption),
            Model: parseResult.GetValue(modelOption),
            WorkingDirectory: parseResult.GetValue(workingDirOption));

        var invoker = new ProcessCopilotCliInvoker(parseResult.GetValue(copilotExeOption)!);
        return (new CopilotCliAgentRunner(invoker, options), new OverfittingJudge());
    }

    /// <summary>
    /// Real mode: workspace assertions probe the run's working directory
    /// and LLM-backed assertions are judged through the Copilot CLI.
    /// </summary>
    private static EvaluateSkillHandler BuildWorkspaceAwareHandler(
        IAgentRunner agentRunner,
        IJudge judge,
        IReporter reporter,
        System.CommandLine.ParseResult parseResult,
        Option<string?> modelOption,
        Option<string?> workingDirOption,
        Option<string> copilotExeOption)
    {
        var workingDirectory = parseResult.GetValue(workingDirOption) ?? Directory.GetCurrentDirectory();
        var probe = new FileSystemWorkspaceProbe(workingDirectory);
        var assertionJudge = new CopilotCliAssertionJudge(
            new ProcessCopilotCliInvoker(parseResult.GetValue(copilotExeOption)!),
            probe,
            parseResult.GetValue(modelOption));
        return new EvaluateSkillHandler(agentRunner, judge, reporter, probe, assertionJudge);
    }
}
