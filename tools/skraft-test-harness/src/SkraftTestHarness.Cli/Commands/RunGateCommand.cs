using System.CommandLine;
using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Application.RunGate;
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
/// <c>run-gate</c> sub-command: the absolute workflow gate. Loads
/// scenarios from an <c>eval.skraft.yml</c> file, runs each one ONCE
/// with the skill/agent loaded (<see cref="RunMode.Isolated"/>),
/// resolves its assertions against the produced workspace, and reports
/// an absolute PASS/FAIL verdict — no baseline, no winner comparison.
/// Exit 0 when the gate holds, 1 otherwise.
///
/// Two execution modes mirror <c>evaluate</c>: <c>--mock</c> uses
/// deterministic in-memory stubs; default drives the real <c>copilot</c>
/// CLI with the skill loaded through <c>--plugin-dir</c>/<c>--agent</c>.
/// </summary>
public static class RunGateCommand
{
    private const string GateFileName = "eval.skraft.yml";

    public static Command Build(TextWriter output)
    {
        var command = new Command("run-gate", "Run one phase agent and assert its gates pass (absolute PASS/FAIL).");

        var skillOption = new Option<string>("--skill")
        {
            Description = "Identifier of the skill/agent under test (e.g. skraft-orchestrator).",
            Required = true,
        };
        var testsDirOption = new Option<string>("--tests-dir")
        {
            Description = "Directory containing the eval.skraft.yml gate file.",
            Required = true,
        };
        var mockOption = new Option<bool>("--mock")
        {
            Description = "Run with deterministic in-memory stubs (no LLM call).",
        };
        var validateOnlyOption = new Option<bool>("--validate-only")
        {
            Description = "Load and construct the gate's assertions without running any agent (deterministic CI guard).",
        };
        var reportDirOption = new Option<string?>("--report-dir")
        {
            Description = "Directory where the JSON gate report (status + telemetry per scenario) is written.",
        };
        var pluginDirOption = new Option<string?>("--plugin-dir")
        {
            Description = "Plugin directory loaded for the run (real mode).",
        };
        var agentOption = new Option<string?>("--agent")
        {
            Description = "Custom Copilot agent loaded for the run (real mode).",
        };
        var modelOption = new Option<string?>("--model")
        {
            Description = "Model pinned for the Copilot CLI run (real mode).",
        };
        var copilotExeOption = new Option<string>("--copilot-exe")
        {
            Description = "Path or name of the copilot executable (real mode).",
            DefaultValueFactory = _ => "copilot",
        };
        var tagsOption = new Option<string?>("--tags")
        {
            Description = "Comma-separated tags; only scenarios carrying ALL of them run.",
        };
        var fixturesRootOption = new Option<string?>("--fixtures-root")
        {
            Description = "Root directory containing fixtures and checkpoints/. Default: ./fixtures.",
        };

        command.Options.Add(skillOption);
        command.Options.Add(testsDirOption);
        command.Options.Add(mockOption);
        command.Options.Add(validateOnlyOption);
        command.Options.Add(reportDirOption);
        command.Options.Add(pluginDirOption);
        command.Options.Add(agentOption);
        command.Options.Add(modelOption);
        command.Options.Add(copilotExeOption);
        command.Options.Add(tagsOption);
        command.Options.Add(fixturesRootOption);

        command.SetAction(async (parseResult, cancellationToken) =>
        {
            var skillId = parseResult.GetValue(skillOption)!;
            var testsDir = parseResult.GetValue(testsDirOption)!;
            var mock = parseResult.GetValue(mockOption);

            IScenarioLoader loader = new YamlEvalLoader(GateFileName);
            Scenarios scenarios;
            try
            {
                scenarios = await loader.LoadAsync(testsDir, cancellationToken);
                scenarios = scenarios.SelectByTags(TagFilter.Parse(parseResult.GetValue(tagsOption)));
            }
            catch (Exception ex)
            {
                await output.WriteLineAsync($"run-gate failed: {ex.Message}");
                return 1;
            }

            // Deterministic, quota-free CI guard: the gate file parsed and every
            // assertion was constructed. No agent runs.
            if (parseResult.GetValue(validateOnlyOption))
            {
                await output.WriteLineAsync(
                    $"gate file is valid ({scenarios.Count()} scenario(s)).");
                return 0;
            }

            var fixturesRoot = parseResult.GetValue(fixturesRootOption)
                ?? Path.Combine(Directory.GetCurrentDirectory(), "fixtures");
            using var scenarioWorkspaces = new FixtureScenarioWorkspaces(fixturesRoot);

            IAgentRunner agentRunner;
            IAssertionJudge assertionJudge;
            if (mock)
            {
                agentRunner = new MockAgentRunner();
                assertionJudge = new MockAssertionJudge();
            }
            else
            {
                var options = new CopilotCliOptions(
                    PluginDirectory: parseResult.GetValue(pluginDirOption),
                    AgentId: parseResult.GetValue(agentOption),
                    Model: parseResult.GetValue(modelOption),
                    WorkingDirectory: null);
                var invoker = new ProcessCopilotCliInvoker(parseResult.GetValue(copilotExeOption)!);
                agentRunner = new CopilotCliAgentRunner(invoker, options);
                assertionJudge = new CopilotCliAssertionJudge(
                    new ProcessCopilotCliInvoker(parseResult.GetValue(copilotExeOption)!),
                    new FileSystemWorkspaceProbe(Directory.GetCurrentDirectory()),
                    parseResult.GetValue(modelOption));
            }

            var probe = new FileSystemWorkspaceProbe(Directory.GetCurrentDirectory());
            var handler = new RunGateHandler(agentRunner, probe, assertionJudge, scenarioWorkspaces);

            GateVerdict verdict;
            try
            {
                verdict = await handler.Handle(
                    new Application.RunGate.RunGateCommand(new SkillReference(skillId), scenarios),
                    cancellationToken);
            }
            catch (Exception ex)
            {
                await output.WriteLineAsync($"run-gate failed: {ex.Message}");
                return 1;
            }

            verdict.RenderEach((name, status, _) => output.WriteLine($"  [{status}] {name}"));

            var reportDir = parseResult.GetValue(reportDirOption);
            if (!string.IsNullOrWhiteSpace(reportDir))
            {
                var reporter = new GateJsonReporter(ReportTarget.Directory(reportDir), TimeProvider.System);
                await reporter.EmitAsync(skillId, verdict, cancellationToken);
            }

            var overall = verdict.IsPass() ? "PASS" : "FAIL";
            await output.WriteLineAsync(
                $"GateVerdict(skill={skillId}, scenarios={scenarios.Count()}, {overall})");
            return verdict.IsPass() ? 0 : 1;
        });

        return command;
    }
}
