using System.CommandLine;
using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Application.RunGate;
using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Domain.Skills;
using SkraftTestHarness.Infrastructure.CopilotCli;
using SkraftTestHarness.Infrastructure.Judging;
using SkraftTestHarness.Infrastructure.Mock;
using SkraftTestHarness.Infrastructure.Workspace;
using SkraftTestHarness.Infrastructure.Yaml;

namespace SkraftTestHarness.Cli.Commands;

/// <summary>
/// <c>run-chain</c> sub-command: the on-demand chained mode (H1). Runs
/// the ordered phase gates sequentially in a SINGLE throwaway git
/// worktree created from a committed revision, so the real output of
/// phase N feeds phase N+1. The chain passes only when every phase gate
/// holds; exit 0 on PASS, 1 on FAIL. The worktree is removed at the end
/// — nothing is ever committed.
/// </summary>
public static class RunChainCommand
{
    private const string GateFileName = "eval.skraft.yml";

    public static Command Build(TextWriter output)
    {
        var command = new Command("run-chain", "Run ordered phase gates sequentially in a throwaway git worktree (H1).");

        var skillOption = new Option<string>("--skill")
        {
            Description = "Identifier of the skill/agent under test (e.g. skraft-orchestrator).",
            Required = true,
        };
        var phasesRootOption = new Option<string>("--phases-root")
        {
            Description = "Directory whose sorted sub-directories each hold an eval.skraft.yml phase gate.",
            Required = true,
        };
        var repoOption = new Option<string>("--repo")
        {
            Description = "Git repository the worktree is created from.",
            Required = true,
        };
        var revOption = new Option<string>("--rev")
        {
            Description = "Committed revision the worktree is checked out at.",
            DefaultValueFactory = _ => "HEAD",
        };
        var mockOption = new Option<bool>("--mock")
        {
            Description = "Run with deterministic in-memory stubs (no LLM call).",
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

        command.Options.Add(skillOption);
        command.Options.Add(phasesRootOption);
        command.Options.Add(repoOption);
        command.Options.Add(revOption);
        command.Options.Add(mockOption);
        command.Options.Add(pluginDirOption);
        command.Options.Add(agentOption);
        command.Options.Add(modelOption);
        command.Options.Add(copilotExeOption);

        command.SetAction(async (parseResult, cancellationToken) =>
        {
            var skillId = parseResult.GetValue(skillOption)!;
            var phasesRoot = parseResult.GetValue(phasesRootOption)!;
            var repo = parseResult.GetValue(repoOption)!;
            var rev = parseResult.GetValue(revOption)!;
            var mock = parseResult.GetValue(mockOption);

            var phaseDirs = OrderedPhaseDirs(phasesRoot);
            if (phaseDirs.Count == 0)
            {
                await output.WriteLineAsync($"run-chain failed: no phase with {GateFileName} under '{phasesRoot}'.");
                return 1;
            }

            using var worktrees = new GitWorktreeProvisioner(repo);
            string worktreeRoot;
            try
            {
                worktreeRoot = worktrees.ProvisionFrom(rev);
            }
            catch (Exception ex)
            {
                await output.WriteLineAsync($"run-chain failed: {ex.Message}");
                return 1;
            }

            var skill = new SkillReference(skillId);
            var allPassed = true;

            foreach (var phaseDir in phaseDirs)
            {
                var phaseName = Path.GetFileName(phaseDir);

                Scenarios scenarios;
                try
                {
                    scenarios = await new YamlEvalLoader(GateFileName).LoadAsync(phaseDir, cancellationToken);
                }
                catch (Exception ex)
                {
                    await output.WriteLineAsync($"  [FAIL] {phaseName}: {ex.Message}");
                    allPassed = false;
                    break;
                }

                var handler = BuildHandler(mock, worktreeRoot, parseResult,
                    pluginDirOption, agentOption, modelOption, copilotExeOption);

                GateVerdict verdict;
                try
                {
                    verdict = await handler.Handle(
                        new Application.RunGate.RunGateCommand(skill, scenarios), cancellationToken);
                }
                catch (Exception ex)
                {
                    await output.WriteLineAsync($"  [FAIL] {phaseName}: {ex.Message}");
                    allPassed = false;
                    break;
                }

                var status = verdict.IsPass() ? "PASS" : "FAIL";
                await output.WriteLineAsync($"  [{status}] {phaseName}");
                if (!verdict.IsPass())
                {
                    allPassed = false;
                    break;
                }
            }

            var overall = allPassed ? "PASS" : "FAIL";
            await output.WriteLineAsync($"ChainVerdict(skill={skillId}, phases={phaseDirs.Count}, {overall})");
            return allPassed ? 0 : 1;
        });

        return command;
    }

    private static IReadOnlyList<string> OrderedPhaseDirs(string phasesRoot)
    {
        if (!Directory.Exists(phasesRoot))
            return [];
        return Directory.GetDirectories(phasesRoot)
            .Where(d => File.Exists(Path.Combine(d, GateFileName)))
            .OrderBy(d => Path.GetFileName(d), StringComparer.Ordinal)
            .ToList();
    }

    private static RunGateHandler BuildHandler(
        bool mock,
        string worktreeRoot,
        System.CommandLine.ParseResult parseResult,
        Option<string?> pluginDirOption,
        Option<string?> agentOption,
        Option<string?> modelOption,
        Option<string> copilotExeOption)
    {
        var probe = new FileSystemWorkspaceProbe(worktreeRoot);

        if (mock)
        {
            return new RunGateHandler(
                new MockAgentRunner(), probe, new MockAssertionJudge(), new AmbientScenarioWorkspaces());
        }

        var options = new CopilotCliOptions(
            PluginDirectory: parseResult.GetValue(pluginDirOption),
            AgentId: parseResult.GetValue(agentOption),
            Model: parseResult.GetValue(modelOption),
            WorkingDirectory: worktreeRoot);
        var invoker = new ProcessCopilotCliInvoker(parseResult.GetValue(copilotExeOption)!);
        var assertionJudge = new CopilotCliAssertionJudge(
            new ProcessCopilotCliInvoker(parseResult.GetValue(copilotExeOption)!),
            probe,
            parseResult.GetValue(modelOption));
        return new RunGateHandler(
            new CopilotCliAgentRunner(invoker, options), probe, assertionJudge, new AmbientScenarioWorkspaces());
    }
}
